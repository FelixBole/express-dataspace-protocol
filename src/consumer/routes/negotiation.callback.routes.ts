import { Router, RequestHandler } from 'express';
import {
  makeConsumerNegotiationHandlers,
  ConsumerNegotiationHandlerDeps,
} from '../handlers/negotiation.callback.handler';

export function makeConsumerNegotiationRouter(
  deps: ConsumerNegotiationHandlerDeps,
  auth: RequestHandler
): Router {
  const router = Router();
  const {
    getNegotiation,
    receiveInitialOffer,
    receiveOffer,
    receiveAgreement,
    receiveEvent,
    receiveTermination,
  } = makeConsumerNegotiationHandlers(deps);

  // §8.3 Consumer path bindings
  router.get('/:consumerPid', auth, getNegotiation);
  router.post('/offers', auth, receiveInitialOffer);
  router.post('/:consumerPid/offers', auth, receiveOffer);
  router.post('/:consumerPid/agreement', auth, receiveAgreement);
  router.post('/:consumerPid/events', auth, receiveEvent);
  router.post('/:consumerPid/termination', auth, receiveTermination);

  return router;
}
