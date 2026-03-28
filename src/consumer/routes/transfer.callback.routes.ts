import { Router, RequestHandler } from 'express';
import {
  makeConsumerTransferHandlers,
  ConsumerTransferHandlerDeps,
} from '../handlers/transfer.callback.handler';

export function makeConsumerTransferRouter(
  deps: ConsumerTransferHandlerDeps,
  auth: RequestHandler
): Router {
  const router = Router();
  const { receiveStart, receiveCompletion, receiveTermination, receiveSuspension } =
    makeConsumerTransferHandlers(deps);

  // §10.3 Consumer callback path bindings
  router.post('/:consumerPid/start', auth, receiveStart);
  router.post('/:consumerPid/completion', auth, receiveCompletion);
  router.post('/:consumerPid/termination', auth, receiveTermination);
  router.post('/:consumerPid/suspension', auth, receiveSuspension);

  return router;
}
