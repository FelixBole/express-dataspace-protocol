import { Request, Response, NextFunction } from 'express';
import { TransferStore } from '../../store/interfaces';
import {
  TransferProcess,
  TransferState,
  TransferRequestMessage,
  TransferStartMessage,
  TransferSuspensionMessage,
  TransferTerminationMessage,
} from '../../types/transfer';
import { DSP_CONTEXT } from '../../types/common';
import {
  nextTransferState,
  InvalidTransferTransitionError,
} from '../../state-machines/transfer.state-machine';
import { generateId } from '../../utils';

export interface TransferHandlerDeps {
  store: TransferStore;
}

function transferResponse(t: TransferProcess) {
  return {
    '@context': [DSP_CONTEXT],
    '@type': 'TransferProcess',
    providerPid: t.providerPid,
    consumerPid: t.consumerPid,
    state: t.state,
  };
}

function notFound(res: Response, providerPid: string) {
  res.status(404).json({
    '@context': [DSP_CONTEXT],
    '@type': 'TransferError',
    code: 'NotFound',
    reason: [`Transfer process '${providerPid}' not found.`],
  });
}

function badTransition(res: Response, err: InvalidTransferTransitionError) {
  res.status(400).json({
    '@context': [DSP_CONTEXT],
    '@type': 'TransferError',
    code: 'InvalidStateTransition',
    reason: [err.message],
  });
}

export function makeTransferHandlers(deps: TransferHandlerDeps) {
  /**
   * GET /transfers/:providerPid — §10.2.1
   */
  async function getTransferProcess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transfer = await deps.store.findByProviderPid(req.params.providerPid);
      if (!transfer) { notFound(res, req.params.providerPid); return; }
      res.status(200).json(transferResponse(transfer));
    } catch (err) { next(err); }
  }

  /**
   * POST /transfers/request — §10.2.2 — Consumer initiates transfer
   */
  async function requestTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as TransferRequestMessage;

      let nextState: TransferState;
      try {
        nextState = nextTransferState(null, 'TransferRequestMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidTransferTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      const transfer = await deps.store.create({
        '@type': 'TransferProcess',
        providerPid: `urn:uuid:${generateId()}`,
        consumerPid: body.consumerPid,
        state: nextState,
        agreementId: body.agreementId,
        format: body.format,
        callbackAddress: body.callbackAddress,
        dataAddress: body.dataAddress,
      });

      res.status(201).json(transferResponse(transfer));
    } catch (err) { next(err); }
  }

  /**
   * POST /transfers/:providerPid/start — §10.2.3
   * Consumer sends TransferStartMessage to restart after suspension.
   */
  async function startTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as TransferStartMessage;
      const transfer = await deps.store.findByProviderPid(req.params.providerPid);
      if (!transfer) { notFound(res, req.params.providerPid); return; }

      let nextState: TransferState;
      try {
        nextState = nextTransferState(transfer.state, 'TransferStartMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidTransferTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      const updated = await deps.store.update(transfer.providerPid, {
        state: nextState,
        dataAddress: body.dataAddress ?? transfer.dataAddress,
      });
      res.status(200).json(transferResponse(updated));
    } catch (err) { next(err); }
  }

  /**
   * POST /transfers/:providerPid/completion — §10.2.4
   */
  async function completeTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transfer = await deps.store.findByProviderPid(req.params.providerPid);
      if (!transfer) { notFound(res, req.params.providerPid); return; }

      let nextState: TransferState;
      try {
        nextState = nextTransferState(transfer.state, 'TransferCompletionMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidTransferTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      const updated = await deps.store.update(transfer.providerPid, { state: nextState });
      res.status(200).json(transferResponse(updated));
    } catch (err) { next(err); }
  }

  /**
   * POST /transfers/:providerPid/suspension — §10.2.6
   */
  async function suspendTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as TransferSuspensionMessage;
      const transfer = await deps.store.findByProviderPid(req.params.providerPid);
      if (!transfer) { notFound(res, req.params.providerPid); return; }

      let nextState: TransferState;
      try {
        nextState = nextTransferState(transfer.state, 'TransferSuspensionMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidTransferTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      void body;
      const updated = await deps.store.update(transfer.providerPid, { state: nextState });
      res.status(200).json(transferResponse(updated));
    } catch (err) { next(err); }
  }

  /**
   * POST /transfers/:providerPid/termination — §10.2.5
   */
  async function terminateTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as TransferTerminationMessage;
      const transfer = await deps.store.findByProviderPid(req.params.providerPid);
      if (!transfer) { notFound(res, req.params.providerPid); return; }

      let nextState: TransferState;
      try {
        nextState = nextTransferState(transfer.state, 'TransferTerminationMessage', 'CONSUMER');
      } catch (err) {
        if (err instanceof InvalidTransferTransitionError) { badTransition(res, err); return; }
        throw err;
      }

      void body;
      const updated = await deps.store.update(transfer.providerPid, { state: nextState });
      res.status(200).json(transferResponse(updated));
    } catch (err) { next(err); }
  }

  // -------------------------------------------------------------------------
  // Provider-initiated helpers called by provider business logic
  // -------------------------------------------------------------------------

  /**
   * Transition REQUESTED → STARTED (Provider starts the transfer).
   */
  async function providerStartTransfer(
    providerPid: string,
    dataAddress?: import('../../types/common').DataAddress
  ): Promise<TransferProcess> {
    const transfer = await deps.store.findByProviderPid(providerPid);
    if (!transfer) throw new Error(`Transfer process not found: ${providerPid}`);

    const nextState = nextTransferState(transfer.state, 'TransferStartMessage', 'PROVIDER');
    return deps.store.update(providerPid, {
      state: nextState,
      ...(dataAddress ? { dataAddress } : {}),
    });
  }

  return {
    getTransferProcess,
    requestTransfer,
    startTransfer,
    completeTransfer,
    suspendTransfer,
    terminateTransfer,
    providerStartTransfer,
  };
}
