import { Request, Response, NextFunction } from 'express';
import { NegotiationStore } from '../../store/interfaces';
import {
  ContractNegotiation,
  NegotiationState,
  ContractRequestMessage,
  ContractNegotiationEventMessage,
  ContractNegotiationTerminationMessage,
} from '../../types/negotiation';
import { DSP_CONTEXT } from '../../types/common';
import {
  nextNegotiationState,
  InvalidNegotiationTransitionError,
  NegotiationMessageType,
} from '../../state-machines/negotiation.state-machine';
import { generateId, nowIso } from '../../utils';

export interface NegotiationHandlerDeps {
  store: NegotiationStore;
}

function negotiationResponse(n: ContractNegotiation) {
  return {
    '@context': [DSP_CONTEXT],
    '@type': 'ContractNegotiation',
    providerPid: n.providerPid,
    consumerPid: n.consumerPid,
    state: n.state,
  };
}

function notFound(res: Response, providerPid: string) {
  // §8.1.2.2 — return 404 when not found or unauthorised
  res.status(404).json({
    '@context': [DSP_CONTEXT],
    '@type': 'ContractNegotiationError',
    code: 'NotFound',
    reason: [`Negotiation '${providerPid}' not found.`],
  });
}

function badTransition(res: Response, err: InvalidNegotiationTransitionError) {
  res.status(400).json({
    '@context': [DSP_CONTEXT],
    '@type': 'ContractNegotiationError',
    code: 'InvalidStateTransition',
    reason: [err.message],
  });
}

export function makeNegotiationHandlers(deps: NegotiationHandlerDeps) {
  /**
   * GET /negotiations/:providerPid — §8.2.1
   */
  async function getNegotiation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const negotiation = await deps.store.findByProviderPid(req.params.providerPid);
      if (!negotiation) { notFound(res, req.params.providerPid); return; }
      res.status(200).json(negotiationResponse(negotiation));
    } catch (err) { next(err); }
  }

  /**
   * POST /negotiations/request — §8.2.2 — Consumer initiates negotiation
   */
  async function requestNegotiation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as ContractRequestMessage;

      let nextState: NegotiationState;
      try {
        nextState = nextNegotiationState(null, 'ContractRequestMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidNegotiationTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      const negotiation = await deps.store.create({
        '@type': 'ContractNegotiation',
        providerPid: `urn:uuid:${generateId()}`,
        consumerPid: body.consumerPid,
        state: nextState,
        callbackAddress: body.callbackAddress,
      });

      res.status(201).json(negotiationResponse(negotiation));
    } catch (err) { next(err); }
  }

  /**
   * POST /negotiations/:providerPid/request — §8.2.3 — Consumer counter-offer
   */
  async function makeContractOffer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const negotiation = await deps.store.findByProviderPid(req.params.providerPid);
      if (!negotiation) { notFound(res, req.params.providerPid); return; }

      let nextState: NegotiationState;
      try {
        nextState = nextNegotiationState(negotiation.state, 'ContractRequestMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidNegotiationTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      const updated = await deps.store.update(negotiation.providerPid, { state: nextState });
      res.status(200).json(negotiationResponse(updated));
    } catch (err) { next(err); }
  }

  /**
   * POST /negotiations/:providerPid/events — §8.2.4
   * Consumer sends ACCEPTED event.
   */
  async function acceptNegotiation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as ContractNegotiationEventMessage;
      const negotiation = await deps.store.findByProviderPid(req.params.providerPid);
      if (!negotiation) { notFound(res, req.params.providerPid); return; }

      const msgType: NegotiationMessageType =
        body.eventType === 'FINALIZED'
          ? 'ContractNegotiationEventMessage:FINALIZED'
          : 'ContractNegotiationEventMessage:ACCEPTED';

      // Only ACCEPTED is valid from Consumer at this endpoint
      if (body.eventType === 'FINALIZED') {
        res.status(400).json({
          '@context': [DSP_CONTEXT],
          '@type': 'ContractNegotiationError',
          code: 'InvalidEventType',
          reason: ['Consumer MUST NOT send FINALIZED event type.'],
        });
        return;
      }

      let nextState: NegotiationState;
      try {
        nextState = nextNegotiationState(negotiation.state, msgType, 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidNegotiationTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      const updated = await deps.store.update(negotiation.providerPid, { state: nextState });
      res.status(200).json(negotiationResponse(updated));
    } catch (err) { next(err); }
  }

  /**
   * POST /negotiations/:providerPid/agreement/verification — §8.2.5
   * Consumer verifies the agreement.
   */
  async function verifyAgreement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const negotiation = await deps.store.findByProviderPid(req.params.providerPid);
      if (!negotiation) { notFound(res, req.params.providerPid); return; }

      let nextState: NegotiationState;
      try {
        nextState = nextNegotiationState(
          negotiation.state,
          'ContractAgreementVerificationMessage',
          'CONSUMER'
        );
      } catch (err) {
        if (err instanceof InvalidNegotiationTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      // After VERIFIED, provider should send FINALIZED event via callback — not handled here
      const updated = await deps.store.update(negotiation.providerPid, { state: nextState });
      res.status(200).json(negotiationResponse(updated));
    } catch (err) { next(err); }
  }

  /**
   * POST /negotiations/:providerPid/termination — §8.2.6
   * Consumer terminates the negotiation.
   */
  async function terminateNegotiation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as ContractNegotiationTerminationMessage;
      const negotiation = await deps.store.findByProviderPid(req.params.providerPid);
      if (!negotiation) { notFound(res, req.params.providerPid); return; }

      let nextState: NegotiationState;
      try {
        nextState = nextNegotiationState(
          negotiation.state,
          'ContractNegotiationTerminationMessage',
          'CONSUMER'
        );
      } catch (err) {
        if (err instanceof InvalidNegotiationTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      void body;
      const updated = await deps.store.update(negotiation.providerPid, { state: nextState });
      res.status(200).json(negotiationResponse(updated));
    } catch (err) { next(err); }
  }

  // -------------------------------------------------------------------------
  // Provider-initiated helpers (called by provider business logic,
  // not directly by Consumer HTTP requests)
  // -------------------------------------------------------------------------

  /**
   * Transition an existing negotiation to AGREED and attach the agreement.
   * Called by provider business logic after processing ACCEPTED state.
   */
  async function sendAgreement(
    providerPid: string,
    agreement: import('../../types/negotiation').Agreement
  ): Promise<ContractNegotiation> {
    const negotiation = await deps.store.findByProviderPid(providerPid);
    if (!negotiation) throw new Error(`Negotiation not found: ${providerPid}`);

    const nextState = nextNegotiationState(
      negotiation.state,
      'ContractAgreementMessage',
      'PROVIDER'
    );

    const agreementWithTimestamp = {
      ...agreement,
      timestamp: agreement.timestamp ?? nowIso(),
    };

    return deps.store.update(providerPid, {
      state: nextState,
      agreement: agreementWithTimestamp,
    });
  }

  /**
   * Transition a VERIFIED negotiation to FINALIZED.
   * Called by provider business logic.
   */
  async function finalizeNegotiation(providerPid: string): Promise<ContractNegotiation> {
    const negotiation = await deps.store.findByProviderPid(providerPid);
    if (!negotiation) throw new Error(`Negotiation not found: ${providerPid}`);

    const nextState = nextNegotiationState(
      negotiation.state,
      'ContractNegotiationEventMessage:FINALIZED',
      'PROVIDER'
    );
    return deps.store.update(providerPid, { state: nextState });
  }

  return {
    getNegotiation,
    requestNegotiation,
    makeContractOffer,
    acceptNegotiation,
    verifyAgreement,
    terminateNegotiation,
    sendAgreement,
    finalizeNegotiation,
  };
}
