// ---------------------------------------------------------------------------
// Contract Negotiation State Machine (pure, no I/O)
// Reference: §7.1.1 & §7.1.2 of DSP 2025-1
// ---------------------------------------------------------------------------

import { NegotiationState, NEGOTIATION_TERMINAL_STATES } from '../types/negotiation';
import { DspActor } from '../types/common';

export type NegotiationMessageType =
  | 'ContractRequestMessage'
  | 'ContractOfferMessage'
  | 'ContractAgreementMessage'
  | 'ContractAgreementVerificationMessage'
  | 'ContractNegotiationEventMessage:ACCEPTED'
  | 'ContractNegotiationEventMessage:FINALIZED'
  | 'ContractNegotiationTerminationMessage';

interface TransitionRule {
  from: NegotiationState | null; // null = initial (no existing negotiation)
  actor: DspActor | 'EITHER';
  to: NegotiationState;
}

/**
 * Valid state transitions derived from the CNP state machine (§7.1.2).
 * The key is `${messageType}` and each entry lists all valid (from→to) pairs.
 */
const TRANSITIONS: Record<NegotiationMessageType, TransitionRule[]> = {
  ContractRequestMessage: [
    // Consumer initiates new negotiation
    { from: null, actor: 'CONSUMER', to: NegotiationState.REQUESTED },
    // Consumer counter-offers on an existing OFFERED negotiation
    { from: NegotiationState.OFFERED, actor: 'CONSUMER', to: NegotiationState.REQUESTED },
  ],
  ContractOfferMessage: [
    // Provider initiates offer (new negotiation from provider side)
    { from: null, actor: 'PROVIDER', to: NegotiationState.OFFERED },
    // Provider counter-offers on REQUESTED
    { from: NegotiationState.REQUESTED, actor: 'PROVIDER', to: NegotiationState.OFFERED },
  ],
  'ContractNegotiationEventMessage:ACCEPTED': [
    { from: NegotiationState.OFFERED, actor: 'CONSUMER', to: NegotiationState.ACCEPTED },
  ],
  ContractAgreementMessage: [
    { from: NegotiationState.ACCEPTED, actor: 'PROVIDER', to: NegotiationState.AGREED },
  ],
  ContractAgreementVerificationMessage: [
    { from: NegotiationState.AGREED, actor: 'CONSUMER', to: NegotiationState.VERIFIED },
  ],
  'ContractNegotiationEventMessage:FINALIZED': [
    { from: NegotiationState.VERIFIED, actor: 'PROVIDER', to: NegotiationState.FINALIZED },
  ],
  ContractNegotiationTerminationMessage: [
    // Can terminate from any non-terminal state
    ...Object.values(NegotiationState)
      .filter((s) => !NEGOTIATION_TERMINAL_STATES.has(s))
      .map((s) => ({ from: s, actor: 'EITHER' as const, to: NegotiationState.TERMINATED })),
  ],
};

/**
 * Returns true if the given message type can be applied to `current` state
 * by `actor`.
 */
export function isValidNegotiationTransition(
  current: NegotiationState | null,
  message: NegotiationMessageType,
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
export function nextNegotiationState(
  current: NegotiationState | null,
  message: NegotiationMessageType,
  actor: DspActor
): NegotiationState {
  if (!isValidNegotiationTransition(current, message, actor)) {
    throw new InvalidNegotiationTransitionError(current, message, actor);
  }
  const rule = TRANSITIONS[message].find(
    (r) =>
      r.from === current &&
      (r.actor === 'EITHER' || r.actor === actor)
  )!;
  return rule.to;
}

export class InvalidNegotiationTransitionError extends Error {
  constructor(
    current: NegotiationState | null,
    message: NegotiationMessageType,
    actor: DspActor
  ) {
    super(
      `Invalid CNP transition: ${actor} cannot send ${message} when state is ${current ?? 'INITIAL'}`
    );
    this.name = 'InvalidNegotiationTransitionError';
  }
}
