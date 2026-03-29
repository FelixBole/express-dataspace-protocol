# Examples

Runnable end-to-end examples for local development and exploration.

> These files are **not published** with the package. They exist purely for development use.

## Running the example

From the project root:

```bash
npm run example
```

This starts a **Provider** (port 3000) and a **Consumer** (port 3001) in the same process and walks through the complete DSP flow automatically, printing every protocol step to the terminal.

## What `run.ts` demonstrates

The example exercises every layer of the library in a realistic sequence:

| Step | Actor | Action | Resulting state |
|------|-------|--------|-----------------|
| 1 | Consumer | Requests the Provider catalog | - |
| 2 | Consumer | Sends `ContractRequestMessage` | REQUESTED |
| 3 | Provider hook | `onNegotiationRequested` → `sendCounterOffer` | OFFERED |
| 4 | Consumer hook | `onOfferReceived` → `acceptNegotiation` | ACCEPTED |
| 5 | Provider hook | `onNegotiationAccepted` → `sendAgreement` | AGREED |
| 6 | Consumer hook | `onAgreementReceived` → `verifyAgreement` | VERIFIED |
| 7 | Provider hook | `onAgreementVerified` → `finalizeNegotiation` | FINALIZED |
| 8 | Consumer hook | `onNegotiationFinalized` → `requestTransfer` | (transfer) REQUESTED |
| 9 | Provider hook | `onTransferRequested` → `providerStartTransfer` | STARTED |
| 10 | Consumer hook | `onTransferStarted` → consume endpoint credentials | ✓ Done |

Steps 3–10 are triggered automatically by hooks, no manual intervention needed.

## Temporary data

The example writes JSON state files to `examples/.tmp/` (gitignored) and cleans them up at the start of each run.

## Notes

- The example imports directly from `../src` so you always run against the live source (no build step needed).
- There is no authentication configured, all requests pass through by default.
- The data channel (`DataAddress`) returned in step 9 is a mock URL; a real provider would provision an actual HTTP endpoint here.
