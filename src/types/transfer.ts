// ---------------------------------------------------------------------------
// Transfer Process Protocol (TPP) types
// Reference: §9 & §10 of DSP 2025-1
// ---------------------------------------------------------------------------

import { DspContext, DataAddress } from "./common";

// ---------------------------------------------------------------------------
// States (§9.1.2)
// ---------------------------------------------------------------------------

/**
 * Possible states of a Transfer Process, tracked by both parties in a TransferProcess entity.
 */
export enum TransferState {
	REQUESTED = "REQUESTED",
	STARTED = "STARTED",
	COMPLETED = "COMPLETED",
	SUSPENDED = "SUSPENDED",
	TERMINATED = "TERMINATED",
}

export const TRANSFER_TERMINAL_STATES: ReadonlySet<TransferState> = new Set([
	TransferState.COMPLETED,
	TransferState.TERMINATED,
]);

// ---------------------------------------------------------------------------
// TransferProcess - the entity tracked by both sides (§9.3.1)
// ---------------------------------------------------------------------------

/**
 * An object returned by either the Consumer or Provider indicating
 * a successful state change happened in the Transfer Process.
 */
export interface TransferProcess {
	"@context"?: DspContext;
	"@type": "TransferProcess";
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

/**
 * Message sent by a Consumer to initiate a Transfer Process.
 *
 * §9.2.1 - sent by Consumer
 */
export interface TransferRequestMessage {
	"@context": DspContext;
	"@type": "TransferRequestMessage";
	consumerPid: string;
	agreementId: string;
	/**
	 * A format specified by a Distribution for the Dataset associated
	 * with the Agreement. This is generally obtained from the
	 * Provider's Catalog.
	 */
	format: string;
	/**
	 * Only to be provided if the format requires a push transfer.
	 */
	dataAddress?: DataAddress;
	/**
	 * A URI indicating where messages to the Consumer should be sent.
	 */
	callbackAddress: string;
}

/**
 * Message sent by the Provider to indicate the data transfer has
 * been initiated.
 *
 * §9.2.2 - sent by Provider (and Consumer to restart)
 */
export interface TransferStartMessage {
	"@context": DspContext;
	"@type": "TransferStartMessage";
	providerPid: string;
	consumerPid: string;
	/**
	 * Must be provided if the current transfer is a pull transfer
	 * and contains a transport-specific endpoint address for
	 * obtaining the data. The kind of transport is signaled
	 * by the endpointType property which determines a set of
	 * required endpointProperties in a Profile.
	 */
	dataAddress?: DataAddress;
}

/**
 * Message sent by either party to indicate when either of them
 * needs to temporarily suspend the Transfer Process.
 *
 * §9.2.3 - sent by either party
 */
export interface TransferSuspensionMessage {
	"@context": DspContext;
	"@type": "TransferSuspensionMessage";
	providerPid: string;
	consumerPid: string;
	code?: string;
	reason?: string[];
}

/**
 * Message sent by the Provider or Consumer when a data transfer
 * has been completed. Realistically, this message is not always
 * sent as some Connector implementations may perform this kind
 * of notification as part of their wire protocol.
 *
 * §9.2.4 - sent by either party
 */
export interface TransferCompletionMessage {
	"@context": DspContext;
	"@type": "TransferCompletionMessage";
	providerPid: string;
	consumerPid: string;
}

/**
 * Message sent by either party at any point except a terminal
 * state to indicate the Transfer Process should stop and be
 * placed in a terminal state. If the termination was due to
 * an error, the sender may include error information.
 *
 * §9.2.5 - sent by either party
 */
export interface TransferTerminationMessage {
	"@context": DspContext;
	"@type": "TransferTerminationMessage";
	providerPid: string;
	consumerPid: string;
	code?: string;
	reason?: string[];
}

// ---------------------------------------------------------------------------
// TPP Error (§9.3.2)
// ---------------------------------------------------------------------------

/**
 * Object returned by either the Consumer or Provider indicating an error
 * has occurred. It does not cause a state transition.
 */
export interface TransferError {
	"@context": DspContext;
	"@type": "TransferError";
	providerPid?: string;
	consumerPid?: string;
	code?: string;
	reason?: string[];
}
