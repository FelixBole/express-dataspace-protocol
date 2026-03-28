// ---------------------------------------------------------------------------
// Transfer Process Protocol (TPP) types
// Reference: §9 & §10 of DSP 2025-1
// ---------------------------------------------------------------------------

import { DspContext, DataAddress } from './common';

// ---------------------------------------------------------------------------
// States (§9.1.2)
// ---------------------------------------------------------------------------

export enum TransferState {
  REQUESTED = 'REQUESTED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED',
}

export const TRANSFER_TERMINAL_STATES: ReadonlySet<TransferState> = new Set([
  TransferState.COMPLETED,
  TransferState.TERMINATED,
]);

// ---------------------------------------------------------------------------
// TransferProcess — the entity tracked by both sides (§9.3.1)
// ---------------------------------------------------------------------------

export interface TransferProcess {
  '@context'?: DspContext;
  '@type': 'TransferProcess';
  providerPid: string;
  consumerPid: string;
  state: TransferState;
  agreementId?: string;
  format?: string;
  /** Callback URL the other party sends messages to */
  callbackAddress?: string;
  dataAddress?: DataAddress;
}

// ---------------------------------------------------------------------------
// TPP messages (§9.2)
// ---------------------------------------------------------------------------

/** §9.2.1 — sent by Consumer */
export interface TransferRequestMessage {
  '@context': DspContext;
  '@type': 'TransferRequestMessage';
  consumerPid: string;
  agreementId: string;
  format: string;
  /** Required for push transfers */
  dataAddress?: DataAddress;
  callbackAddress: string;
}

/** §9.2.2 — sent by Provider (and Consumer to restart) */
export interface TransferStartMessage {
  '@context': DspContext;
  '@type': 'TransferStartMessage';
  providerPid: string;
  consumerPid: string;
  /** Required for pull transfers */
  dataAddress?: DataAddress;
}

/** §9.2.3 — sent by either party */
export interface TransferSuspensionMessage {
  '@context': DspContext;
  '@type': 'TransferSuspensionMessage';
  providerPid: string;
  consumerPid: string;
  code?: string;
  reason?: string[];
}

/** §9.2.4 — sent by either party */
export interface TransferCompletionMessage {
  '@context': DspContext;
  '@type': 'TransferCompletionMessage';
  providerPid: string;
  consumerPid: string;
}

/** §9.2.5 — sent by either party */
export interface TransferTerminationMessage {
  '@context': DspContext;
  '@type': 'TransferTerminationMessage';
  providerPid: string;
  consumerPid: string;
  code?: string;
  reason?: string[];
}

// ---------------------------------------------------------------------------
// TPP Error (§9.3.2)
// ---------------------------------------------------------------------------

export interface TransferError {
  '@context': DspContext;
  '@type': 'TransferError';
  providerPid?: string;
  consumerPid?: string;
  code?: string;
  reason?: string[];
}
