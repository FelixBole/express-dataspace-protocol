import { Request, Response, NextFunction } from "express";
import { CatalogStore } from "../../store/interfaces";
import { CatalogRequestMessage } from "../../types/catalog";
import { DSP_CONTEXT } from "../../types/common";

type CatalogFilterFn = (
	filter: unknown,
	store: CatalogStore,
) => Promise<import("../../types/catalog").Catalog>;
type CatalogPaginateFn = (
	catalog: import("../../types/catalog").Catalog,
	req: Request,
) => {
	data: import("../../types/catalog").Catalog;
	next?: string;
	prev?: string;
};

export interface CatalogHandlerDeps {
	store: CatalogStore;
	catalogFilter?: CatalogFilterFn;
	catalogPaginate?: CatalogPaginateFn;
}

export function makeCatalogHandlers(deps: CatalogHandlerDeps) {
	/**
	 * POST /catalog/request — §6.2.1
	 * Consumer sends CatalogRequestMessage; Provider responds with Catalog.
	 */
	async function requestCatalog(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as Partial<CatalogRequestMessage>;

			// Decision made here to be permissive and not require the required fields verification for @context and @type.

			if (body.filter !== undefined) {
				if (!deps.catalogFilter) {
					res.status(400).json({
						"@context": [DSP_CONTEXT],
						"@type": "CatalogError",
						code: "FilterNotSupported",
						reason: [
							"This Catalog Service does not support filter expressions.",
						],
					});
					return;
				}
				const catalog = await deps.catalogFilter(
					body.filter,
					deps.store,
				);
				res.status(200).json(catalog);
				return;
			}

			let catalog = await deps.store.getCatalog();

			if (deps.catalogPaginate) {
				const { data, next, prev } = deps.catalogPaginate(catalog, req);
				catalog = data;
				if (next) res.setHeader("Link", `<${next}>; rel="next"`);
				if (prev) res.append("Link", `<${prev}>; rel="previous"`);
			}

			res.status(200).json(catalog);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * GET /catalog/datasets/:id — §6.2.2
	 * Consumer requests a specific Dataset.
	 */
	async function getDataset(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const { id } = req.params;
			const dataset = await deps.store.getDataset(id);

			if (!dataset) {
				res.status(404).json({
					"@context": [DSP_CONTEXT],
					"@type": "CatalogError",
					code: "NotFound",
					reason: [`Dataset '${id}' not found.`],
				});
				return;
			}

			res.status(200).json(dataset);
		} catch (err) {
			next(err);
		}
	}

	return { requestCatalog, getDataset };
}
