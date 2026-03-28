// ---------------------------------------------------------------------------
// Hook interfaces — user-supplied callbacks fired after each inbound DSP
// message is validated, state-transitioned, and stored. All hooks are
// optional and fire-and-forget: the HTTP response is already sent before
// the hook runs. Errors thrown inside a hook are caught and logged but do
// NOT affect the protocol response.
// ---------------------------------------------------------------------------

import { ContractNegotiation } from "./negotiation";
import { TransferProcess } from "./transfer";

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

/** A hook that receives the updated negotiation entity. */
export type NegotiationHook = (
	negotiation: ContractNegotiation,
) => void | Promise<void>;

/** A hook that receives the updated transfer process entity. */
export type TransferHook = (transfer: TransferProcess) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Provider-side hooks
// Fired when the Provider receives a message FROM the Consumer.
// ---------------------------------------------------------------------------

/**
 * Hooks for inbound Consumer→Provider negotiation messages.
 *
 * The two most action-critical hooks are:
 * - `onNegotiationAccepted` — Consumer accepted your offer; call
 *   `provider.negotiation.sendAgreement()` here.
 * - `onAgreementVerified` — Consumer verified the agreement; call
 *   `provider.negotiation.finalizeNegotiation()` here.
 */
export interface ProviderNegotiationHooks {
	/**
	 * Consumer sent `ContractRequestMessage` **without** a `providerPid` — a
	 * brand-new negotiation. State is now `REQUESTED`. The
	 * `negotiation.offer` field contains the Consumer's requested terms.
	 *
	 * Typical response: call `provider.negotiation.sendCounterOffer()` or
	 * `provider.negotiation.sendAgreement()`, or let a human review first.
	 */
	onNegotiationRequested?: NegotiationHook;

	/**
	 * Consumer sent `ContractRequestMessage` **with** a `providerPid` —
	 * re-requesting on an existing negotiation (e.g. after receiving a
	 * Provider counter-offer). State advances back to `REQUESTED`.
	 * The `negotiation.offer` field contains the Consumer's updated terms.
	 *
	 * Typical response: same as `onNegotiationRequested` — inspect the new
	 * offer and call `sendCounterOffer()` or `sendAgreement()`.
	 */
	onNegotiationReRequested?: NegotiationHook;

	/**
	 * Consumer sent `ContractNegotiationEventMessage` with `eventType=ACCEPTED`.
	 * State is now `ACCEPTED` — the Consumer has accepted your offer.
	 *
	 * **Most common action:** call `provider.negotiation.sendAgreement()`.
	 */
	onNegotiationAccepted?: NegotiationHook;

	/**
	 * Consumer sent `ContractAgreementVerificationMessage`. State is now
	 * `VERIFIED` — the Consumer has verified your agreement.
	 *
	 * **Most common action:** call `provider.negotiation.finalizeNegotiation()`.
	 */
	onAgreementVerified?: NegotiationHook;

	/**
	 * Consumer sent `ContractNegotiationTerminationMessage`. State is now
	 * `TERMINATED`. Notification only — no protocol response is expected.
	 */
	onNegotiationTerminated?: NegotiationHook;
}

/**
 * Hooks for inbound Consumer→Provider transfer messages.
 *
 * The most action-critical hook is:
 * - `onTransferRequested` — Consumer requested a transfer; call
 *   `provider.transfer.providerStartTransfer()` here.
 */
export interface ProviderTransferHooks {
	/**
	 * Consumer sent `TransferRequestMessage`. State is now `REQUESTED`.
	 *
	 * **Most common action:** call `provider.transfer.providerStartTransfer()`.
	 */
	onTransferRequested?: TransferHook;

	/**
	 * Consumer sent `TransferStartMessage` to resume a suspended transfer.
	 * State is now `STARTED`. Resume your data streaming pipeline.
	 */
	onTransferRestartedByConsumer?: TransferHook;

	/**
	 * Consumer sent `TransferCompletionMessage`. State is now `COMPLETED`.
	 */
	onTransferCompletedByConsumer?: TransferHook;

	/**
	 * Consumer sent `TransferSuspensionMessage`. State is now `SUSPENDED`.
	 */
	onTransferSuspendedByConsumer?: TransferHook;

	/**
	 * Consumer sent `TransferTerminationMessage`. State is now `TERMINATED`.
	 */
	onTransferTerminatedByConsumer?: TransferHook;
}

// ---------------------------------------------------------------------------
// Consumer-side hooks
// Fired when the Consumer receives a message FROM the Provider.
// ---------------------------------------------------------------------------

/**
 * Hooks for inbound Provider→Consumer negotiation messages.
 *
 * The most action-critical hooks are:
 * - `onOfferReceived` — Provider sent an offer; decide whether to
 *   `consumer.negotiation.acceptOffer()` or counter-request.
 * - `onAgreementReceived` — Provider sent an agreement; call
 *   `consumer.negotiation.verifyAgreement()`.
 */
export interface ConsumerNegotiationHooks {
	/**
	 * Provider sent `ContractOfferMessage` (either a new Provider-initiated
	 * negotiation or a counter-offer on an existing one). State is now
	 * `OFFERED`. The `negotiation.offer` field contains the Provider's terms.
	 *
	 * Typical response: call `consumer.negotiation.acceptOffer()` or
	 * `consumer.negotiation.requestNegotiation()` with counter-terms.
	 */
	onOfferReceived?: NegotiationHook;

	/**
	 * Provider sent `ContractAgreementMessage`. State is now `AGREED`.
	 *
	 * **Most common action:** call `consumer.negotiation.verifyAgreement()`.
	 * Inspect `negotiation.agreement` for the full agreement terms first.
	 */
	onAgreementReceived?: NegotiationHook;

	/**
	 * Provider sent `ContractNegotiationEventMessage` with `eventType=FINALIZED`.
	 * State is now `FINALIZED`. The negotiation is complete — the agreement
	 * in `negotiation.agreement` is now live. Persist or act on it.
	 */
	onNegotiationFinalized?: NegotiationHook;

	/**
	 * Provider sent `ContractNegotiationTerminationMessage`. State is now
	 * `TERMINATED`. Notification only.
	 */
	onNegotiationTerminated?: NegotiationHook;
}

/**
 * Hooks for inbound Provider→Consumer transfer messages.
 *
 * The most action-critical hook is:
 * - `onTransferStarted` — Provider started the transfer; begin consuming
 *   data. For PULL transfers, `transfer.dataAddress` contains the endpoint.
 */
export interface ConsumerTransferHooks {
	/**
	 * Provider sent `TransferStartMessage`. State is now `STARTED`.
	 * For PULL transfers, `transfer.dataAddress` contains the endpoint and
	 * credentials to fetch the data from.
	 *
	 * **Most common action:** start pulling/receiving data.
	 */
	onTransferStarted?: TransferHook;

	/**
	 * Provider sent `TransferCompletionMessage`. State is now `COMPLETED`.
	 */
	onTransferCompleted?: TransferHook;

	/**
	 * Provider sent `TransferSuspensionMessage`. State is now `SUSPENDED`.
	 * Pause your data pipeline. The Provider may restart via
	 * `providerStartTransfer`, or you can restart via
	 * `consumer.transfer.startTransfer()`.
	 */
	onTransferSuspended?: TransferHook;

	/**
	 * Provider sent `TransferTerminationMessage`. State is now `TERMINATED`.
	 */
	onTransferTerminated?: TransferHook;
}
