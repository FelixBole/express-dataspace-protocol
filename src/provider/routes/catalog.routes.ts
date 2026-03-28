import { Router, RequestHandler } from 'express';
import { makeCatalogHandlers, CatalogHandlerDeps } from '../handlers/catalog.handler';

export function makeCatalogRouter(deps: CatalogHandlerDeps, auth: RequestHandler): Router {
  const router = Router();
  const { requestCatalog, getDataset } = makeCatalogHandlers(deps);

  router.post('/request', auth, requestCatalog);
  router.get('/datasets/:id', auth, getDataset);

  return router;
}
