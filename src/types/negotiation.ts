// ---------------------------------------------------------------------------
// Contract Negotiation Protocol (CNP) types
// Reference: §7 & §8 of DSP 2025-1
// ---------------------------------------------------------------------------

import { DspContext } from "./common";
import { Offer, Permission, Prohibition, Duty } from "./catalog";

// ---------------------------------------------------------------------------
// States (§7.1.1)
// ---------------------------------------------------------------------------

export enum NegotiationState {
	REQUESTED = "REQUESTED",
	OFFERED = "OFFERED",
	ACCEPTED = "ACCEPTED",
	AGREED = "AGREED",
	VERIFIED = "VERIFIED",
	FINALIZED = "FINALIZED",
	TERMINATED = "TERMINATED",
}

export const NEGOTIATION_TERMINAL_STATES: ReadonlySet<NegotiationState> =
	new Set([NegotiationState.FINALIZED, NegotiationState.TERMINATED]);

// ---------------------------------------------------------------------------
// Agreement (§7.2.3 / Appendix A)
// ---------------------------------------------------------------------------

export interface Agreement {
	"@id": string;
	"@type": "Agreement";
	target: string;
	timestamp?: string;
	assigner: string;
	assignee: string;
	permission?: Permission[];
	prohibition?: Prohibition[];
	obligation?: Duty[];
	profile?: string | string[];
}

// ---------------------------------------------------------------------------
// ContractNegotiation — the entity tracked by both sides (§7.3.1)
// ---------------------------------------------------------------------------

export interface ContractNegotiation {
	"@context"?: DspContext;
	"@type": "ContractNegotiation";
	providerPid: string;
	consumerPid: string;
	state: NegotiationState;
	agreement?: Agreement;
	/**
	 * The current offer in play. Set when the Consumer sends a
	 * ContractRequestMessage (Provider side) or when the Provider sends a
	 * ContractOfferMessage (Consumer side). Available to hooks so
	 * business logic can inspect terms without a separate store look-up.
	 */
	offer?: MessageOffer;
	/** Callback URL the other party sends messages to */
	callbackAddress?: string;
}

// ---------------------------------------------------------------------------
// Offer inside a message (must have target, §7.2.1 / §7.2.2)
// ---------------------------------------------------------------------------

export interface MessageOffer extends Omit<Offer, "target"> {
	target: string;
}

// ---------------------------------------------------------------------------
// CNP messages (§7.2)
// ---------------------------------------------------------------------------

/** §7.2.1 — sent by Consumer */
export interface ContractRequestMessage {
	"@context": DspContext;
	"@type": "ContractRequestMessage";
	consumerPid: string;
	/** Required when joining an existing negotiation */
	providerPid?: string;
	offer: MessageOffer;
	callbackAddress: string;
}

/** §7.2.2 — sent by Provider */
export interface ContractOfferMessage {
	"@context": DspContext;
	"@type": "ContractOfferMessage";
	providerPid: string;
	/** Required when joining an existing negotiation */
	consumerPid?: string;
	offer: MessageOffer;
	callbackAddress: string;
	dataset?: string;
}

/** §7.2.3 — sent by Provider */
export interface ContractAgreementMessage {
	"@context": DspContext;
	"@type": "ContractAgreementMessage";
	providerPid: string;
	consumerPid: string;
	agreement: Agreement;
}

/** §7.2.4 — sent by Consumer */
export interface ContractAgreementVerificationMessage {
	"@context": DspContext;
	"@type": "ContractAgreementVerificationMessage";
	providerPid: string;
	consumerPid: string;
}

export type NegotiationEventType = "ACCEPTED" | "FINALIZED";

/** §7.2.5 — sent by Consumer (ACCEPTED) or Provider (FINALIZED) */
export interface ContractNegotiationEventMessage {
	"@context": DspContext;
	"@type": "ContractNegotiationEventMessage";
	providerPid: string;
	consumerPid: string;
	eventType: NegotiationEventType;
}

/** §7.2.6 — sent by either party */
export interface ContractNegotiationTerminationMessage {
	"@context": DspContext;
	"@type": "ContractNegotiationTerminationMessage";
	providerPid: string;
	consumerPid: string;
	code?: string;
	reason?: string[];
}

// ---------------------------------------------------------------------------
// CNP Error (§7.3.2)
// ---------------------------------------------------------------------------

export interface ContractNegotiationError {
	"@context": DspContext;
	"@type": "ContractNegotiationError";
	providerPid?: string;
	consumerPid?: string;
	code?: string;
	reason?: string[];
}
