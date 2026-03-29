import {
	Router,
	RequestHandler,
	Request,
	Response,
	NextFunction,
} from "express";
import { NegotiationStore, TransferStore } from "../store/interfaces";
import { errorHandler } from "../middleware/error.middleware";
import {
	ConsumerNegotiationHooks,
	ConsumerTransferHooks,
} from "../types/hooks";
import { makeConsumerNegotiationRouter } from "./routes/negotiation.callback.routes";
import { makeConsumerTransferRouter } from "./routes/transfer.callback.routes";
import { makeCatalogClient } from "./client/catalog.client";
import { makeNegotiationClient } from "./client/negotiation.client";
import { makeTransferClient } from "./client/transfer.client";
// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DspConsumerOptions {
	/**
	 * Base URL where this Consumer's callback endpoints are reachable from the
	 * network (i.e. what gets sent as `callbackAddress` to Providers).
	 * Example: 'https://my-connector.example.com/dsp/callback'
	 */
	callbackAddress: string;

	/** Persistence adapters for negotiation and transfer state */
	store: {
		negotiation: NegotiationStore;
		transfer: TransferStore;
	};

	/**
	 * Express middleware that authenticates inbound callback requests.
	 * Defaults to a no-op.
	 */
	auth?: RequestHandler;

	/**
	 * Called before every outbound HTTP request to a Provider. Return a Bearer
	 * token string (or undefined to omit the Authorization header).
	 */
	getOutboundToken?: (providerBaseUrl: string) => Promise<string | undefined>;

	/**
	 * Optional hooks fired after each inbound Provider message is processed.
	 * Use these to run business logic in response to protocol events - e.g.
	 * call `consumer.negotiation.verifyAgreement()` inside `onAgreementReceived`.
	 *
	 * Hooks are fire-and-forget: the HTTP response is already sent before they
	 * run. Errors thrown inside a hook are logged but do not affect the protocol.
	 */
	hooks?: {
		negotiation?: ConsumerNegotiationHooks;
		transfer?: ConsumerTransferHooks;
	};
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface DspConsumer {
	/**
	 * Mount this router at the base of your callback URL.
	 *
	 * @example
	 * app.use('/dsp/callback', consumer.callbackRouter);
	 */
	callbackRouter: Router;

	/** Outbound client for Catalog Protocol requests */
	catalog: ReturnType<typeof makeCatalogClient>;

	/** Outbound client for Contract Negotiation Protocol requests */
	negotiation: ReturnType<typeof makeNegotiationClient>;

	/** Outbound client for Transfer Process Protocol requests */
	transfer: ReturnType<typeof makeTransferClient>;

	/** The computed callbackAddress - matches options.callbackAddress */
	callbackAddress: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const noopAuth: RequestHandler = (
	_req: Request,
	_res: Response,
	next: NextFunction,
) => next();

export function createDspConsumer(options: DspConsumerOptions): DspConsumer {
	const auth = options.auth ?? noopAuth;
	const clientDeps = { getOutboundToken: options.getOutboundToken };

	const callbackRouter = Router();
	callbackRouter.use(
		"/negotiations",
		makeConsumerNegotiationRouter(
			{
				store: options.store.negotiation,
				hooks: options.hooks?.negotiation,
			},
			auth,
		),
	);
	callbackRouter.use(
		"/transfers",
		makeConsumerTransferRouter(
			{ store: options.store.transfer, hooks: options.hooks?.transfer },
			auth,
		),
	);
	callbackRouter.use(errorHandler);

	return {
		callbackRouter,
		catalog: makeCatalogClient(clientDeps),
		negotiation: makeNegotiationClient({
			...clientDeps,
			store: options.store.negotiation,
		}),
		transfer: makeTransferClient({
			...clientDeps,
			store: options.store.transfer,
		}),
		callbackAddress: options.callbackAddress,
	};
}
