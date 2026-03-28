// ---------------------------------------------------------------------------
// Persistence adapter interfaces
// Users implement these to plug in any storage backend.
// ---------------------------------------------------------------------------

import { Catalog, Dataset } from "../types/catalog";
import { ContractNegotiation } from "../types/negotiation";
import { TransferProcess } from "../types/transfer";

// ---------------------------------------------------------------------------
// CatalogStore
// ---------------------------------------------------------------------------

export interface CatalogStore {
	/**
	 * Return the Catalog, optionally filtered by an implementation-specific
	 * filter expression.  Returning the full catalog when filter is absent is
	 * always valid.
	 */
	getCatalog(filter?: unknown): Promise<Catalog>;

	/**
	 * Return a single Dataset by its @id, or null if not found.
	 */
	getDataset(id: string): Promise<Dataset | null>;
}

// ---------------------------------------------------------------------------
// NegotiationStore
// ---------------------------------------------------------------------------

export interface NegotiationStore {
	create(negotiation: ContractNegotiation): Promise<ContractNegotiation>;

	findByProviderPid(providerPid: string): Promise<ContractNegotiation | null>;

	findByConsumerPid(consumerPid: string): Promise<ContractNegotiation | null>;

	update(
		providerPid: string,
		patch: Partial<ContractNegotiation>,
	): Promise<ContractNegotiation>;
}

// ---------------------------------------------------------------------------
// TransferStore
// ---------------------------------------------------------------------------

export interface TransferStore {
	create(transfer: TransferProcess): Promise<TransferProcess>;

	findByProviderPid(providerPid: string): Promise<TransferProcess | null>;

	findByConsumerPid(consumerPid: string): Promise<TransferProcess | null>;

	update(
		providerPid: string,
		patch: Partial<TransferProcess>,
	): Promise<TransferProcess>;
}

// ---------------------------------------------------------------------------
// Composite store — all three together
// ---------------------------------------------------------------------------

export interface DspStore {
	catalog: CatalogStore;
	negotiation: NegotiationStore;
	transfer: TransferStore;
}
