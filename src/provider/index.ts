import { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import { DspStore, CatalogStore } from '../store/interfaces';
import { VersionEntry } from '../types/common';
import { Catalog } from '../types/catalog';
import { makeVersionRouter } from './routes/version.routes';
import { makeCatalogRouter } from './routes/catalog.routes';
import { makeNegotiationRouter } from './routes/negotiation.routes';
import { makeTransferRouter } from './routes/transfer.routes';
import { makeNegotiationHandlers } from './handlers/negotiation.handler';
import { makeTransferHandlers } from './handlers/transfer.handler';
import { errorHandler } from '../middleware/error.middleware';

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
  version?: Omit<VersionEntry, 'binding'>;

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
    req: Request
  ) => { data: Catalog; next?: string; prev?: string };
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
   * Mount this at root (not under the base path) — §4.3 requires the
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

const noopAuth: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

export function createDspProvider(options: DspProviderOptions): DspProvider {
  const auth = options.auth ?? noopAuth;

  // DSP protocol router (mount at <base>)
  const router = Router();
  router.use('/catalog', makeCatalogRouter(
    {
      store: options.store.catalog,
      catalogFilter: options.catalogFilter,
      catalogPaginate: options.catalogPaginate,
    },
    auth
  ));
  router.use('/negotiations', makeNegotiationRouter({ store: options.store.negotiation }, auth));
  router.use('/transfers', makeTransferRouter({ store: options.store.transfer }, auth));
  router.use(errorHandler);

  // Well-known router (mount at root)
  const versionEntry: VersionEntry = {
    version: '2025-1',
    path: '/dsp',
    binding: 'HTTPS',
    ...options.version,
  };
  const wellKnownRouter = makeVersionRouter({ versionEntry });

  // Provider-initiated helpers
  const negotiation = makeNegotiationHandlers({ store: options.store.negotiation });
  const transfer = makeTransferHandlers({ store: options.store.transfer });

  return { router, wellKnownRouter, negotiation, transfer };
}
