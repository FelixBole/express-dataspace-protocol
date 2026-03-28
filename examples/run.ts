/**
 * examples/run.ts
 *
 * A complete end-to-end walkthrough of express-dataspace-protocol.
 *
 * Starts a Provider (port 3000) and a Consumer (port 3001) in the same
 * process and uses hooks on both sides to drive the full DSP flow:
 *
 *   Step 1  Consumer  → requests the Provider catalog
 *   Step 2  Consumer  → sends ContractRequestMessage         (state: REQUESTED)
 *   Step 3  Provider  hook onNegotiationRequested            → sendCounterOffer  (OFFERED)
 *   Step 4  Consumer  hook onOfferReceived                   → acceptNegotiation (ACCEPTED)
 *   Step 5  Provider  hook onNegotiationAccepted             → sendAgreement     (AGREED)
 *   Step 6  Consumer  hook onAgreementReceived               → verifyAgreement   (VERIFIED)
 *   Step 7  Provider  hook onAgreementVerified               → finalizeNegotiation (FINALIZED)
 *   Step 8  Consumer  hook onNegotiationFinalized            → requestTransfer   (transfer REQUESTED)
 *   Step 9  Provider  hook onTransferRequested               → providerStartTransfer (STARTED)
 *   Step 10 Consumer  hook onTransferStarted                 → data channel ready ✓
 *
 * Run:
 *   npm run example
 */

import express from 'express';
import { Server } from 'http';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  createDspProvider,
  createDspConsumer,
  createDiskStore,
} from '../src';
import type { DspProvider, DspConsumer, Agreement } from '../src';

// ---------------------------------------------------------------------------
// Terminal colours
// ---------------------------------------------------------------------------

const R = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

const ts = () => new Date().toISOString().slice(11, 23);

const log = {
  provider: (msg: string) =>
    console.log(`${DIM}${ts()}${R}  ${CYAN}${BOLD}[PROVIDER]${R}  ${msg}`),
  consumer: (msg: string) =>
    console.log(`${DIM}${ts()}${R}  ${YELLOW}${BOLD}[CONSUMER]${R}  ${msg}`),
  runner: (msg: string) =>
    console.log(`${DIM}${ts()}${R}  ${MAGENTA}${BOLD}[ RUNNER ]${R}  ${msg}`),
};

function step(n: number, msg: string) {
  console.log(`\n${BOLD}── Step ${n}  ${msg}${R}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROVIDER_PORT = 3000;
const CONSUMER_PORT = 3001;
const PROVIDER_BASE = `http://localhost:${PROVIDER_PORT}/dsp`;
const CONSUMER_CALLBACK = `http://localhost:${CONSUMER_PORT}/callback`;
const DATASET_ID = 'urn:dataset:climate-data:2024';
const TMP = path.join(__dirname, '.tmp');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listenAsync(app: express.Application, port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      log.runner(`Listening on http://localhost:${port}`);
      resolve(server);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Clean up state files from any previous run
  log.runner('Cleaning up temporary data from previous runs...');
  await fs.rm(TMP, { recursive: true, force: true });

  // ── Stores ────────────────────────────────────────────────────────────────

  const providerStore = await createDiskStore({ dir: path.join(TMP, 'provider') });
  const consumerStore = await createDiskStore({ dir: path.join(TMP, 'consumer') });

  // Seed the provider catalog with one dataset
  await providerStore.catalogStore.seed({
    '@id': 'urn:catalog:provider-main',
    '@type': 'Catalog',
    dataset: [
      {
        '@id': DATASET_ID,
        '@type': 'Dataset',
        name: 'Global Climate Data 2024',
        description: 'Monthly temperature averages for 2024 across 195 countries.',
        hasPolicy: [
          {
            '@id': 'urn:offer:open-access',
            permission: [{ action: 'use' }],
          },
        ],
        distribution: [],
      },
    ],
    service: [],
  });

  // ── Flow completion tracking ───────────────────────────────────────────────

  let resolveFlow!: () => void;
  let rejectFlow!: (err: Error) => void;

  const flowComplete = new Promise<void>((res, rej) => {
    resolveFlow = res;
    rejectFlow = rej;
  });

  // Guard against an uncaught hook error leaving the process hanging
  const flowTimeout = setTimeout(() => {
    rejectFlow(new Error('Flow timed out after 15s — a hook may have thrown.'));
  }, 15_000);

  // ── Forward-declare both instances (hooks reference them via closure) ──────
  //
  // Both are assigned synchronously below before any HTTP traffic arrives,
  // so by the time a hook fires, the variable is always defined.

  // eslint-disable-next-line prefer-const
  let provider!: DspProvider;
  // eslint-disable-next-line prefer-const
  let consumer!: DspConsumer;

  // ── Provider ──────────────────────────────────────────────────────────────

  provider = createDspProvider({
    store: providerStore,
    providerAddress: PROVIDER_BASE,
    hooks: {
      negotiation: {
        /**
         * A Consumer sent a ContractRequestMessage.
         * The Provider echoes back an equivalent offer (auto-approve pattern).
         * State: REQUESTED → OFFERED
         */
        onNegotiationRequested: async (negotiation) => {
          log.provider(
            `Negotiation requested  consumerPid=${negotiation.consumerPid}` +
            `  dataset=${negotiation.offer?.target}`
          );
          log.provider('  → Sending offer to Consumer (OFFERED)...');

          await provider.negotiation.sendCounterOffer(negotiation.providerPid, {
            '@id': `urn:offer:provider-${randomUUID()}`,
            target: negotiation.offer?.target ?? DATASET_ID,
            permission: negotiation.offer?.permission ?? [],
          });
        },

        /**
         * Consumer sent ContractNegotiationEventMessage with eventType=ACCEPTED.
         * Provider generates and sends a formal Agreement.
         * State: ACCEPTED → AGREED
         */
        onNegotiationAccepted: async (negotiation) => {
          log.provider(`Consumer accepted offer  providerPid=${negotiation.providerPid}`);
          log.provider('  → Sending agreement (AGREED)...');

          const agreement: Agreement = {
            '@id': `urn:agreement:${randomUUID()}`,
            '@type': 'Agreement',
            target: negotiation.offer?.target ?? DATASET_ID,
            assigner: 'urn:connector:provider-example',
            assignee: 'urn:connector:consumer-example',
            permission: negotiation.offer?.permission ?? [],
          };

          await provider.negotiation.sendAgreement(negotiation.providerPid, agreement);
        },

        /**
         * Consumer sent ContractAgreementVerificationMessage.
         * Provider finalizes the negotiation.
         * State: VERIFIED → FINALIZED
         */
        onAgreementVerified: async (negotiation) => {
          log.provider(`Agreement verified  providerPid=${negotiation.providerPid}`);
          log.provider('  → Finalizing negotiation (FINALIZED)...');
          await provider.negotiation.finalizeNegotiation(negotiation.providerPid);
          log.provider('  Negotiation FINALIZED ✓');
        },
      },

      transfer: {
        /**
         * Consumer sent a TransferRequestMessage.
         * Provider provisions a (mock) data channel and starts the transfer.
         * State: REQUESTED → STARTED
         */
        onTransferRequested: async (transfer) => {
          log.provider(
            `Transfer requested  providerPid=${transfer.providerPid}  format=${transfer.format}`
          );
          log.provider('  → Provisioning HTTP_PULL data channel (simulated 150 ms)...');

          await new Promise((r) => setTimeout(r, 150));

          await provider.transfer.providerStartTransfer(transfer.providerPid, {
            '@type': 'DataAddress',
            endpointType: 'https://w3id.org/idsa/v4.1/HTTP',
            endpoint: 'https://data.example.com/climate-2024.csv',
            endpointProperties: [
              {
                '@type': 'EndpointProperty',
                name: 'authorization',
                value: 'Bearer demo-access-token-xyz',
              },
              {
                '@type': 'EndpointProperty',
                name: 'authType',
                value: 'bearer',
              },
            ],
          });

          log.provider('  Transfer STARTED ✓');
        },
      },
    },
  });

  // ── Consumer ──────────────────────────────────────────────────────────────

  consumer = createDspConsumer({
    callbackAddress: CONSUMER_CALLBACK,
    store: {
      negotiation: consumerStore.negotiation,
      transfer: consumerStore.transfer,
    },
    hooks: {
      negotiation: {
        /**
         * Provider sent a ContractOfferMessage.
         * Consumer inspects the offer and sends ACCEPTED.
         * State: OFFERED → ACCEPTED
         */
        onOfferReceived: async (negotiation) => {
          log.consumer(`Offer received  consumerPid=${negotiation.consumerPid}`);
          log.consumer(`  Terms: ${JSON.stringify(negotiation.offer?.permission)}`);
          log.consumer('  → Accepting offer (ACCEPTED)...');

          await consumer.negotiation.acceptNegotiation(
            PROVIDER_BASE,
            negotiation.providerPid,
            negotiation.consumerPid
          );
        },

        /**
         * Provider sent a ContractAgreementMessage.
         * Consumer verifies the agreement.
         * State: AGREED → VERIFIED
         */
        onAgreementReceived: async (negotiation) => {
          log.consumer(
            `Agreement received  agreementId=${negotiation.agreement?.['@id']}`
          );
          log.consumer('  → Verifying agreement (VERIFIED)...');

          await consumer.negotiation.verifyAgreement(
            PROVIDER_BASE,
            negotiation.providerPid,
            negotiation.consumerPid
          );
        },

        /**
         * Provider sent ContractNegotiationEventMessage with eventType=FINALIZED.
         * Negotiation is complete — Consumer now requests a data transfer.
         */
        onNegotiationFinalized: async (negotiation) => {
          log.consumer(
            `Negotiation FINALIZED ✓  agreementId=${negotiation.agreement?.['@id']}`
          );
          log.consumer('  → Requesting transfer (HTTP_PULL)...');

          await consumer.transfer.requestTransfer(PROVIDER_BASE, {
            agreementId: negotiation.agreement!['@id'],
            format: 'HTTP_PULL',
            callbackAddress: CONSUMER_CALLBACK,
          });
        },
      },

      transfer: {
        /**
         * Provider started the transfer — data channel credentials are available.
         * Consumer "downloads" the data (simulated).
         */
        onTransferStarted: async (transfer) => {
          log.consumer(`Transfer STARTED ✓  consumerPid=${transfer.consumerPid}`);

          const addr = transfer.dataAddress as Record<string, unknown> | undefined;
          if (addr) {
            log.consumer(`  Endpoint : ${addr['endpoint']}`);
            const props = addr['endpointProperties'] as Array<Record<string, string>> | undefined;
            const authProp = props?.find((p) => p['name'] === 'authorization');
            if (authProp) log.consumer(`  Auth     : ${authProp['value']}`);
          }

          log.consumer('  → Simulating data download (300 ms)...');
          await new Promise((r) => setTimeout(r, 300));
          log.consumer('  Data consumed successfully ✓');

          resolveFlow();
        },
      },
    },
  });

  // ── Express apps ──────────────────────────────────────────────────────────

  const providerApp = express();
  providerApp.use(express.json());
  providerApp.use(provider.wellKnownRouter);
  providerApp.use('/dsp', provider.router);

  const consumerApp = express();
  consumerApp.use(express.json());
  consumerApp.use('/callback', consumer.callbackRouter);

  const providerServer = await listenAsync(providerApp, PROVIDER_PORT);
  const consumerServer = await listenAsync(consumerApp, CONSUMER_PORT);

  // ── Run the flow ──────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(66));
  console.log(`${BOLD}   express-dataspace-protocol  —  END-TO-END DSP EXAMPLE${R}`);
  console.log('═'.repeat(66));

  step(1, 'Consumer requests the Provider catalog');
  const catalog = await consumer.catalog.requestCatalog(PROVIDER_BASE);
  const datasets = catalog.dataset ?? [];
  log.consumer(`Catalog received — ${datasets.length} dataset(s):`);
  for (const d of datasets as Array<Record<string, unknown>>) {
    log.consumer(`  •  [${d['@id']}]  ${d['name'] ?? d['@id']}`);
  }

  step(2, 'Consumer initiates Contract Negotiation  (state: REQUESTED)');
  const negotiation = await consumer.negotiation.requestNegotiation(PROVIDER_BASE, {
    callbackAddress: CONSUMER_CALLBACK,
    offer: {
      '@id': 'urn:offer:consumer-initial-request',
      target: DATASET_ID,
      permission: [{ action: 'use' }],
    },
  });
  log.consumer(
    `ContractRequestMessage sent` +
    `  consumerPid=${negotiation.consumerPid}` +
    `  providerPid=${negotiation.providerPid}`
  );

  step(3, 'Hooks drive all remaining steps automatically');
  log.runner('(PROVIDER and CONSUMER hook reactions follow)\n');

  // Wait for the complete flow (resolved in consumer onTransferStarted hook)
  await flowComplete;
  clearTimeout(flowTimeout);

  console.log('\n' + '═'.repeat(66));
  console.log(`${GREEN}${BOLD}   ✓  Complete DSP flow finished successfully!${R}`);
  console.log('');
  console.log('   Contract Negotiation Protocol (CNP):');
  console.log('     REQUESTED → OFFERED → ACCEPTED → AGREED → VERIFIED → FINALIZED');
  console.log('');
  console.log('   Transfer Process Protocol (TPP):');
  console.log('     REQUESTED → STARTED');
  console.log('═'.repeat(66) + '\n');

  // ── Shutdown ──────────────────────────────────────────────────────────────

  providerServer.close();
  consumerServer.close();
  log.runner('Servers stopped. Done.');
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n${RED}${BOLD}[ERROR]${R} ${msg}`);
  if (err instanceof Error && err.stack) {
    console.error(DIM + err.stack + R);
  }
  process.exit(1);
});
