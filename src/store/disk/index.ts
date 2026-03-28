import { promises as fs } from "fs";
import * as path from "path";
import { DspStore } from "../interfaces";
import { DiskCatalogStore } from "./disk-catalog.store";
import { DiskNegotiationStore } from "./disk-negotiation.store";
import { DiskTransferStore } from "./disk-transfer.store";

export interface DiskStoreOptions {
	/**
	 * Directory where JSON files will be stored.
	 * Will be created if it does not exist.
	 *
	 * **NOT production-safe** — no locking, no replication.
	 * Intended for testing and demonstration purposes only.
	 */
	dir: string;
}

/**
 * Creates a file-backed DspStore using plain JSON files.
 *
 * Returns all three stores as a composite DspStore object, plus the
 * individual typed store instances for test-helper access (e.g. seeding).
 */
export async function createDiskStore(options: DiskStoreOptions): Promise<
	DspStore & {
		catalogStore: DiskCatalogStore;
		negotiationStore: DiskNegotiationStore;
		transferStore: DiskTransferStore;
	}
> {
	await fs.mkdir(options.dir, { recursive: true });

	const catalogStore = new DiskCatalogStore(options.dir);
	const negotiationStore = new DiskNegotiationStore(options.dir);
	const transferStore = new DiskTransferStore(options.dir);

	return {
		catalog: catalogStore,
		negotiation: negotiationStore,
		transfer: transferStore,
		catalogStore,
		negotiationStore,
		transferStore,
	};
}

export { DiskCatalogStore, DiskNegotiationStore, DiskTransferStore };

// Re-export convenience path helper so consumers can clean up in tests
export function diskStoreDir(dir: string): string {
	return path.resolve(dir);
}
