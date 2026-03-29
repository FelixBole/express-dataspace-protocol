import {
	Router,
	RequestHandler,
	Request,
	Response,
	NextFunction,
} from "express";
import { DspStore, CatalogStore } from "../store/interfaces";
import { VersionEntry } from "../types/common";
import { Catalog } from "../types/catalog";
import {
	ProviderNegotiationHooks,
	ProviderTransferHooks,
} from "../types/hooks";
import { makeVersionRouter } from "./routes/version.routes";
import { makeCatalogRouter } from "./routes/catalog.routes";
import { makeNegotiationRouter } from "./routes/negotiation.routes";
import { makeTransferRouter } from "./routes/transfer.routes";
import { makeNegotiationHandlers } from "./handlers/negotiation.handler";
import { makeTransferHandlers } from "./handlers/transfer.handler";
import { errorHandler } from "../middleware/error.middleware";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DspProviderOptions {
	/** Storage adapters for catalog, negotiations, and transfer processes */
	store: DspStore;

	/**
	 * Express middleware that authenticates inbound requests.
	 * Defaults to a no-op (all requests pass through).
	 * The `Authorization` header is available on `req.headers.authorization`.
	 */
	auth?: RequestHandler;

	/**
	 * DSP version metadata for the /.well-known/dspace-version endpoint (§4.3).
	 * The path should point to where your DSP routes are mounted on the host app.
	 */
	version?: Omit<VersionEntry, "binding">;

	/**
	 * Optional filter handler for catalog requests (§5.4.1).
	 * If a Consumer sends a non-empty `filter`, this function is called.
	 * If absent and a filter is provided, the endpoint returns HTTP 400.
	 */
	catalogFilter?: (filter: unknown, store: CatalogStore) => Promise<Catalog>;

	/**
	 * Optional pagination handler (§6.3.1).
	 * If provided, it is called on every catalog response.
	 */
	catalogPaginate?: (
		catalog: Catalog,
		req: Request,
	) => { data: Catalog; next?: string; prev?: string };

	/**
	 * Called before every outbound HTTP request to a Consumer's callbackAddress.
	 * Return a Bearer token string (e.g. `'Bearer <token>'`) or undefined to
	 * omit the Authorization header.
	 * Required if provider-initiated helpers need to authenticate callbacks.
	 */
	getOutboundToken?: (
		consumerCallbackUrl: string,
	) => Promise<string | undefined>;

	/**
	 * The public base URL of this Provider's DSP API.
	 * Used as the `callbackAddress` field in outbound CNP messages (e.g.
	 * ContractOfferMessage) so the Consumer knows where to call back.
	 * Example: 'https://my-provider.example.com/dsp'
	 */
	providerAddress?: string;

	/**
	 * Optional hooks fired after each inbound Consumer message is processed.
	 * Use these to run business logic in response to protocol events - e.g.
	 * call `provider.negotiation.sendAgreement()` inside `onNegotiationAccepted`.
	 *
	 * Hooks are fire-and-forget: the HTTP response is already sent before they
	 * run. Errors thrown inside a hook are logged but do not affect the protocol.
	 */
	hooks?: {
		negotiation?: ProviderNegotiationHooks;
		transfer?: ProviderTransferHooks;
	};
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface DspProvider {
	/**
	 * Mount this router on your Express app at the desired base path.
	 * The /.well-known/dspace-version endpoint will be handled separately
	 * (it must be mounted at root, NOT under the base path).
	 *
	 * @example
	 * app.use(provider.wellKnownRouter);  // at root
	 * app.use('/dsp', provider.router);
	 */
	router: Router;

	/**
	 * Mount this at root (not under the base path) - §4.3 requires the
	 * well-known endpoint to be unversioned and unauthenticated.
	 */
	wellKnownRouter: Router;

	/**
	 * Provider-side helpers that business logic can call to drive state
	 * transitions that the Provider initiates (e.g. send agreement, finalize,
	 * start transfer).
	 */
	negotiation: ReturnType<typeof makeNegotiationHandlers>;
	transfer: ReturnType<typeof makeTransferHandlers>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const noopAuth: RequestHandler = (
	_req: Request,
	_res: Response,
	next: NextFunction,
) => next();

export function createDspProvider(options: DspProviderOptions): DspProvider {
	const auth = options.auth ?? noopAuth;

	// DSP protocol router (mount at <base>)
	const router = Router();
	router.use(
		"/catalog",
		makeCatalogRouter(
			{
				store: options.store.catalog,
				catalogFilter: options.catalogFilter,
				catalogPaginate: options.catalogPaginate,
			},
			auth,
		),
	);
	router.use(
		"/negotiations",
		makeNegotiationRouter(
			{
				store: options.store.negotiation,
				hooks: options.hooks?.negotiation,
			},
			auth,
		),
	);
	router.use(
		"/transfers",
		makeTransferRouter(
			{
				store: options.store.transfer,
				hooks: options.hooks?.transfer,
			},
			auth,
		),
	);
	router.use(errorHandler);

	// Well-known router (mount at root)
	const versionEntry: VersionEntry = {
		version: "2025-1",
		path: "/dsp",
		binding: "HTTPS",
		...options.version,
	};
	const wellKnownRouter = makeVersionRouter({ versionEntry });

	// Provider-initiated helpers (include outbound token + provider address)
	const negotiation = makeNegotiationHandlers({
		store: options.store.negotiation,
		getOutboundToken: options.getOutboundToken,
		providerAddress: options.providerAddress,
	});
	const transfer = makeTransferHandlers({
		store: options.store.transfer,
		getOutboundToken: options.getOutboundToken,
	});

	return { router, wellKnownRouter, negotiation, transfer };
}
