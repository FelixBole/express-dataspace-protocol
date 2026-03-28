/**
 * In-memory implementations of CatalogStore, NegotiationStore, and TransferStore.
 * For use in tests only — no persistence.
 */

import {
	CatalogStore,
	NegotiationStore,
	TransferStore,
	DspStore,
} from "../../src/store/interfaces";
import { Catalog, Dataset } from "../../src/types/catalog";
import { ContractNegotiation } from "../../src/types/negotiation";
import { TransferProcess } from "../../src/types/transfer";

// ---------------------------------------------------------------------------
// In-memory catalog
// ---------------------------------------------------------------------------

export class InMemoryCatalogStore implements CatalogStore {
	private catalog: Catalog;
	private datasets: Map<string, Dataset>;

	constructor(catalog: Catalog, datasets: Dataset[] = []) {
		this.catalog = catalog;
		this.datasets = new Map(datasets.map((d) => [d["@id"], d]));
	}

	async getCatalog(): Promise<Catalog> {
		return this.catalog;
	}

	async getDataset(id: string): Promise<Dataset | null> {
		return this.datasets.get(id) ?? null;
	}
}

// ---------------------------------------------------------------------------
// In-memory negotiation store
// ---------------------------------------------------------------------------

export class InMemoryNegotiationStore implements NegotiationStore {
	private byProvider: Map<string, ContractNegotiation> = new Map();
	private byConsumer: Map<string, ContractNegotiation> = new Map();

	async create(
		negotiation: ContractNegotiation,
	): Promise<ContractNegotiation> {
		this.byProvider.set(negotiation.providerPid, negotiation);
		this.byConsumer.set(negotiation.consumerPid, negotiation);
		return negotiation;
	}

	async findByProviderPid(
		providerPid: string,
	): Promise<ContractNegotiation | null> {
		return this.byProvider.get(providerPid) ?? null;
	}

	async findByConsumerPid(
		consumerPid: string,
	): Promise<ContractNegotiation | null> {
		return this.byConsumer.get(consumerPid) ?? null;
	}

	async update(
		providerPid: string,
		patch: Partial<ContractNegotiation>,
	): Promise<ContractNegotiation> {
		const existing = this.byProvider.get(providerPid);
		if (!existing) throw new Error(`Negotiation not found: ${providerPid}`);
		const updated = { ...existing, ...patch };
		this.byProvider.set(providerPid, updated);
		this.byConsumer.set(updated.consumerPid, updated);
		return updated;
	}

	/** Seed with a pre-existing negotiation (useful in tests). */
	seed(negotiation: ContractNegotiation): this {
		this.byProvider.set(negotiation.providerPid, negotiation);
		this.byConsumer.set(negotiation.consumerPid, negotiation);
		return this;
	}
}

// ---------------------------------------------------------------------------
// In-memory transfer store
// ---------------------------------------------------------------------------

export class InMemoryTransferStore implements TransferStore {
	private byProvider: Map<string, TransferProcess> = new Map();
	private byConsumer: Map<string, TransferProcess> = new Map();

	async create(transfer: TransferProcess): Promise<TransferProcess> {
		this.byProvider.set(transfer.providerPid, transfer);
		this.byConsumer.set(transfer.consumerPid, transfer);
		return transfer;
	}

	async findByProviderPid(
		providerPid: string,
	): Promise<TransferProcess | null> {
		return this.byProvider.get(providerPid) ?? null;
	}

	async findByConsumerPid(
		consumerPid: string,
	): Promise<TransferProcess | null> {
		return this.byConsumer.get(consumerPid) ?? null;
	}

	async update(
		providerPid: string,
		patch: Partial<TransferProcess>,
	): Promise<TransferProcess> {
		const existing = this.byProvider.get(providerPid);
		if (!existing) throw new Error(`Transfer not found: ${providerPid}`);
		const updated = { ...existing, ...patch };
		this.byProvider.set(providerPid, updated);
		this.byConsumer.set(updated.consumerPid, updated);
		return updated;
	}

	/** Seed with a pre-existing transfer process. */
	seed(transfer: TransferProcess): this {
		this.byProvider.set(transfer.providerPid, transfer);
		this.byConsumer.set(transfer.consumerPid, transfer);
		return this;
	}
}

// ---------------------------------------------------------------------------
// Composite factory
// ---------------------------------------------------------------------------

export function makeInMemoryStore(options?: {
	catalog?: Catalog;
	datasets?: Dataset[];
}): DspStore & {
	catalog: InMemoryCatalogStore;
	negotiation: InMemoryNegotiationStore;
	transfer: InMemoryTransferStore;
} {
	const defaultCatalog: Catalog = {
		"@context": ["https://w3id.org/dspace/2025/1/context.jsonld"],
		"@type": "Catalog",
		"@id": "urn:catalog:default",
		dataset: [],
		service: [],
	};

	return {
		catalog: new InMemoryCatalogStore(
			options?.catalog ?? defaultCatalog,
			options?.datasets,
		),
		negotiation: new InMemoryNegotiationStore(),
		transfer: new InMemoryTransferStore(),
	};
}
