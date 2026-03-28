import { promises as fs } from "fs";
import * as path from "path";
import { CatalogStore } from "../interfaces";
import { Catalog, Dataset } from "../../types/catalog";

export class DiskCatalogStore implements CatalogStore {
	private readonly filePath: string;

	constructor(dir: string) {
		this.filePath = path.join(dir, "catalog.json");
	}

	private async read(): Promise<Catalog> {
		try {
			const raw = await fs.readFile(this.filePath, "utf-8");
			return JSON.parse(raw) as Catalog;
		} catch {
			// Return a minimal empty catalog if file doesn't exist yet
			return {
				"@id": `urn:uuid:${Date.now()}`,
				"@type": "Catalog",
				dataset: [],
				service: [],
			};
		}
	}

	async getCatalog(filter?: unknown): Promise<Catalog> {
		const catalog = await this.read();
		// filter application is delegated to the user via DspProviderOptions.catalogFilter;
		// this base implementation ignores the filter and returns the full catalog.
		void filter;
		return catalog;
	}

	async getDataset(id: string): Promise<Dataset | null> {
		const catalog = await this.read();
		return catalog.dataset?.find((d) => d["@id"] === id) ?? null;
	}

	/** Seed helper — writes a full catalog to disk (useful in tests). */
	async seed(catalog: Catalog): Promise<void> {
		await fs.writeFile(
			this.filePath,
			JSON.stringify(catalog, null, 2),
			"utf-8",
		);
	}
}
