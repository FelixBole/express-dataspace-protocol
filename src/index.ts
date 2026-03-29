// ---------------------------------------------------------------------------
// express-dataspace-protocol - public API
// ---------------------------------------------------------------------------

// Factories
export { createDspProvider } from "./provider";
export type { DspProviderOptions, DspProvider } from "./provider";

export { createDspConsumer } from "./consumer";
export type { DspConsumerOptions, DspConsumer } from "./consumer";

// Persistence interfaces
export type {
	CatalogStore,
	NegotiationStore,
	TransferStore,
	DspStore,
} from "./store/interfaces";

// Reference disk persistence adapter
export { createDiskStore } from "./store/disk";
export type { DiskStoreOptions } from "./store/disk";

// DSP message types and enums
export type {
	// Common
	DspContext,
	DataAddress,
	EndpointProperty,
	VersionResponse,
	VersionEntry,
	AuthInfo,
	DspActor,
	// Catalog
	Catalog,
	Dataset,
	Distribution,
	DataService,
	Offer,
	MessageOffer,
	Permission,
	Prohibition,
	Duty,
	Constraint,
	CatalogRequestMessage,
	DatasetRequestMessage,
	CatalogError,
	// Negotiation
	ContractNegotiation,
	Agreement,
	ContractRequestMessage,
	ContractOfferMessage,
	ContractAgreementMessage,
	ContractAgreementVerificationMessage,
	ContractNegotiationEventMessage,
	NegotiationEventType,
	ContractNegotiationTerminationMessage,
	ContractNegotiationError,
	// Transfer
	TransferProcess,
	TransferRequestMessage,
	TransferStartMessage,
	TransferCompletionMessage,
	TransferSuspensionMessage,
	TransferTerminationMessage,
	TransferError,
} from "./types";

export {
	NegotiationState,
	NEGOTIATION_TERMINAL_STATES,
} from "./types/negotiation";
export { TransferState, TRANSFER_TERMINAL_STATES } from "./types/transfer";
export { DSP_CONTEXT } from "./types/common";

// Hook interfaces
export type {
	NegotiationHook,
	TransferHook,
	ProviderNegotiationHooks,
	ProviderTransferHooks,
	ConsumerNegotiationHooks,
	ConsumerTransferHooks,
} from "./types/hooks";

// State machine utilities (for users who want to inspect transitions)
export {
	isValidNegotiationTransition,
	nextNegotiationState,
	InvalidNegotiationTransitionError,
} from "./state-machines/negotiation.state-machine";
export type { NegotiationMessageType } from "./state-machines/negotiation.state-machine";

export {
	isValidTransferTransition,
	nextTransferState,
	InvalidTransferTransitionError,
} from "./state-machines/transfer.state-machine";
export type { TransferMessageType } from "./state-machines/transfer.state-machine";
