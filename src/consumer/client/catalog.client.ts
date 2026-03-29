import { DSP_CONTEXT } from "../../types/common";
import { Catalog, Dataset, CatalogRequestMessage } from "../../types/catalog";
import { buildUrl } from "../../utils";

export interface CatalogClientDeps {
	getOutboundToken?: (providerBaseUrl: string) => Promise<string | undefined>;
}

async function dspFetch<T>(
	url: string,
	options: RequestInit,
	getToken?: (base: string) => Promise<string | undefined>,
): Promise<T> {
	const base = new URL(url).origin;
	const token = getToken ? await getToken(base) : undefined;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string> | undefined),
	};
	if (token) headers["Authorization"] = token;

	const res = await fetch(url, { ...options, headers });

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new DspClientError(res.status, url, body);
	}
	return res.json() as Promise<T>;
}

export class DspClientError extends Error {
	constructor(
		public readonly status: number,
		public readonly url: string,
		public readonly body: string,
	) {
		super(`DSP request failed: ${status} ${url}`);
		this.name = "DspClientError";
	}
}

export function makeCatalogClient(deps: CatalogClientDeps) {
	/**
	 * POST <providerBase>/catalog/request - §6.2.1
	 */
	async function requestCatalog(
		providerBaseUrl: string,
		filter?: unknown,
	): Promise<Catalog> {
		const msg: CatalogRequestMessage = {
			"@context": [DSP_CONTEXT],
			"@type": "CatalogRequestMessage",
			...(filter !== undefined ? { filter } : {}),
		};

		return dspFetch<Catalog>(
			buildUrl(providerBaseUrl, "/catalog/request"),
			{ method: "POST", body: JSON.stringify(msg) },
			deps.getOutboundToken,
		);
	}

	/**
	 * GET <providerBase>/catalog/datasets/:id - §6.2.2
	 */
	async function getDataset(
		providerBaseUrl: string,
		datasetId: string,
	): Promise<Dataset> {
		return dspFetch<Dataset>(
			buildUrl(
				providerBaseUrl,
				`/catalog/datasets/${encodeURIComponent(datasetId)}`,
			),
			{ method: "GET" },
			deps.getOutboundToken,
		);
	}

	return { requestCatalog, getDataset };
}
