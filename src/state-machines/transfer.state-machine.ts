// ---------------------------------------------------------------------------
// Transfer Process State Machine (pure, no I/O)
// Reference: §9.1.2 & §9.1.3 of DSP 2025-1
// ---------------------------------------------------------------------------

import { TransferState, TRANSFER_TERMINAL_STATES } from '../types/transfer';
import { DspActor } from '../types/common';

export type TransferMessageType =
  | 'TransferRequestMessage'
  | 'TransferStartMessage'
  | 'TransferCompletionMessage'
  | 'TransferSuspensionMessage'
  | 'TransferTerminationMessage';

interface TransitionRule {
  from: TransferState | null;
  actor: DspActor | 'EITHER';
  to: TransferState;
}

const TRANSITIONS: Record<TransferMessageType, TransitionRule[]> = {
  TransferRequestMessage: [
    // Consumer initiates new transfer process
    { from: null, actor: 'CONSUMER', to: TransferState.REQUESTED },
  ],
  TransferStartMessage: [
    // Provider starts after REQUESTED
    { from: TransferState.REQUESTED, actor: 'PROVIDER', to: TransferState.STARTED },
    // Consumer restarts after SUSPENDED
    { from: TransferState.SUSPENDED, actor: 'CONSUMER', to: TransferState.STARTED },
    // Provider restarts after SUSPENDED
    { from: TransferState.SUSPENDED, actor: 'PROVIDER', to: TransferState.STARTED },
  ],
  TransferCompletionMessage: [
    { from: TransferState.STARTED, actor: 'EITHER', to: TransferState.COMPLETED },
  ],
  TransferSuspensionMessage: [
    { from: TransferState.STARTED, actor: 'EITHER', to: TransferState.SUSPENDED },
  ],
  TransferTerminationMessage: [
    // Can terminate from any non-terminal state
    ...Object.values(TransferState)
      .filter((s) => !TRANSFER_TERMINAL_STATES.has(s))
      .map((s) => ({ from: s, actor: 'EITHER' as const, to: TransferState.TERMINATED })),
  ],
};

/**
 * Returns true if the given message type can be applied to `current` state
 * by `actor`.
 */
export function isValidTransferTransition(
  current: TransferState | null,
  message: TransferMessageType,
  actor: DspActor
): boolean {
  const rules = TRANSITIONS[message];
  if (!rules) return false;

  return rules.some(
    (r) =>
      r.from === current &&
      (r.actor === 'EITHER' || r.actor === actor)
  );
}

/**
 * Returns the next state after applying `message`, or throws a descriptive
 * error if the transition is invalid.
 */
export function nextTransferState(
  current: TransferState | null,
  message: TransferMessageType,
  actor: DspActor
): TransferState {
  if (!isValidTransferTransition(current, message, actor)) {
    throw new InvalidTransferTransitionError(current, message, actor);
  }
  const rule = TRANSITIONS[message].find(
    (r) =>
      r.from === current &&
      (r.actor === 'EITHER' || r.actor === actor)
  )!;
  return rule.to;
}

export class InvalidTransferTransitionError extends Error {
  constructor(
    current: TransferState | null,
    message: TransferMessageType,
    actor: DspActor
  ) {
    super(
      `Invalid TPP transition: ${actor} cannot send ${message} when state is ${current ?? 'INITIAL'}`
    );
    this.name = 'InvalidTransferTransitionError';
  }
}
