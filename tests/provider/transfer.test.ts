import express from 'express';
import request from 'supertest';
import { createDspProvider } from '../../src/provider';
import { makeInMemoryStore, InMemoryTransferStore } from '../helpers/in-memory-store';
import { TransferState, TransferProcess } from '../../src/types/transfer';

function makeApp() {
  const store = makeInMemoryStore();
  const provider = createDspProvider({ store });

  const app = express();
  app.use(express.json());
  app.use('/dsp', provider.router);
  return { app, xferStore: store.transfer };
}

function seedTransfer(
  store: InMemoryTransferStore,
  overrides: Partial<TransferProcess> = {}
): TransferProcess {
  const transfer: TransferProcess = {
    '@type': 'TransferProcess',
    providerPid: 'urn:uuid:tp-provider-001',
    consumerPid: 'urn:uuid:tp-consumer-001',
    state: TransferState.REQUESTED,
    agreementId: 'urn:agreement:001',
    format: 'HTTP_PUSH',
    callbackAddress: 'https://consumer.example/callback',
    ...overrides,
  };
  store.seed(transfer);
  return transfer;
}

describe('Provider — Transfer endpoints (§10.2)', () => {
  describe('POST /dsp/transfers/request — initiate transfer', () => {
    it('creates a new transfer process and returns 201', async () => {
      const { app } = makeApp();

      const res = await request(app)
        .post('/dsp/transfers/request')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferRequestMessage',
          consumerPid: 'urn:uuid:tp-consumer-002',
          agreementId: 'urn:agreement:002',
          format: 'HTTP_PULL',
          callbackAddress: 'https://consumer.example/callback',
        });

      expect(res.status).toBe(201);
      expect(res.body['@type']).toBe('TransferProcess');
      expect(res.body.state).toBe(TransferState.REQUESTED);
      expect(res.body.providerPid).toBeDefined();
    });
  });

  describe('GET /dsp/transfers/:providerPid — get transfer', () => {
    it('returns 200 with transfer process details', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore);

      const res = await request(app).get('/dsp/transfers/urn:uuid:tp-provider-001');

      expect(res.status).toBe(200);
      expect(res.body['@type']).toBe('TransferProcess');
      expect(res.body.providerPid).toBe('urn:uuid:tp-provider-001');
      expect(res.body.state).toBe(TransferState.REQUESTED);
    });

    it('returns 404 for unknown providerPid', async () => {
      const { app } = makeApp();

      const res = await request(app).get('/dsp/transfers/urn:uuid:unknown');

      expect(res.status).toBe(404);
      expect(res.body['@type']).toBe('TransferError');
    });
  });

  describe('POST /dsp/transfers/:providerPid/start — consumer restarts from SUSPENDED', () => {
    it('transitions SUSPENDED → STARTED', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore, { state: TransferState.SUSPENDED });

      const res = await request(app)
        .post('/dsp/transfers/urn:uuid:tp-provider-001/start')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferStartMessage',
          providerPid: 'urn:uuid:tp-provider-001',
          consumerPid: 'urn:uuid:tp-consumer-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe(TransferState.STARTED);
    });

    it('returns 400 for invalid transition from REQUESTED (must use providerStartTransfer helper)', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore, { state: TransferState.REQUESTED });

      const res = await request(app)
        .post('/dsp/transfers/urn:uuid:tp-provider-001/start')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferStartMessage',
          providerPid: 'urn:uuid:tp-provider-001',
          consumerPid: 'urn:uuid:tp-consumer-001',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /dsp/transfers/:providerPid/completion — complete transfer', () => {
    it('transitions STARTED → COMPLETED', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore, { state: TransferState.STARTED });

      const res = await request(app)
        .post('/dsp/transfers/urn:uuid:tp-provider-001/completion')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferCompletionMessage',
          providerPid: 'urn:uuid:tp-provider-001',
          consumerPid: 'urn:uuid:tp-consumer-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe(TransferState.COMPLETED);
    });
  });

  describe('POST /dsp/transfers/:providerPid/suspension — suspend transfer', () => {
    it('transitions STARTED → SUSPENDED', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore, { state: TransferState.STARTED });

      const res = await request(app)
        .post('/dsp/transfers/urn:uuid:tp-provider-001/suspension')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferSuspensionMessage',
          providerPid: 'urn:uuid:tp-provider-001',
          consumerPid: 'urn:uuid:tp-consumer-001',
          code: 'MAINTENANCE',
          reason: ['Scheduled maintenance'],
        });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe(TransferState.SUSPENDED);
    });
  });

  describe('POST /dsp/transfers/:providerPid/termination — terminate transfer', () => {
    it('transitions STARTED → TERMINATED', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore, { state: TransferState.STARTED });

      const res = await request(app)
        .post('/dsp/transfers/urn:uuid:tp-provider-001/termination')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferTerminationMessage',
          providerPid: 'urn:uuid:tp-provider-001',
          consumerPid: 'urn:uuid:tp-consumer-001',
        });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe(TransferState.TERMINATED);
    });

    it('returns 400 when already in a terminal state', async () => {
      const { app, xferStore } = makeApp();
      seedTransfer(xferStore, { state: TransferState.COMPLETED });

      const res = await request(app)
        .post('/dsp/transfers/urn:uuid:tp-provider-001/termination')
        .send({
          '@context': ['https://w3id.org/dspace/2025/1/context.jsonld'],
          '@type': 'TransferTerminationMessage',
          providerPid: 'urn:uuid:tp-provider-001',
          consumerPid: 'urn:uuid:tp-consumer-001',
        });

      expect(res.status).toBe(400);
    });
  });
});
