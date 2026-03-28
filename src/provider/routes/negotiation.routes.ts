import { Router, RequestHandler } from 'express';
import { makeNegotiationHandlers, NegotiationHandlerDeps } from '../handlers/negotiation.handler';

export function makeNegotiationRouter(deps: NegotiationHandlerDeps, auth: RequestHandler): Router {
  const router = Router();
  const {
    getNegotiation,
    requestNegotiation,
    makeContractOffer,
    acceptNegotiation,
    verifyAgreement,
    terminateNegotiation,
  } = makeNegotiationHandlers(deps);

  // §8.2 Provider path bindings
  router.get('/:providerPid', auth, getNegotiation);
  router.post('/request', auth, requestNegotiation);
  router.post('/:providerPid/request', auth, makeContractOffer);
  router.post('/:providerPid/events', auth, acceptNegotiation);
  router.post('/:providerPid/agreement/verification', auth, verifyAgreement);
  router.post('/:providerPid/termination', auth, terminateNegotiation);

  return router;
}
