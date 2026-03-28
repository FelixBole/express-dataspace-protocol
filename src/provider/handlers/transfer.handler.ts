import { Request, Response, NextFunction } from 'express';
import { TransferStore } from '../../store/interfaces';
import {
  TransferProcess,
  TransferState,
  TransferRequestMessage,
  TransferStartMessage,
  TransferSuspensionMessage,
  TransferCompletionMessage,
  TransferTerminationMessage,
} from '../../types/transfer';
import { DSP_CONTEXT, DataAddress } from '../../types/common';
import {
  nextTransferState,
  InvalidTransferTransitionError,
} from '../../state-machines/transfer.state-machine';
import { generateId, buildUrl, fireHook } from '../../utils';
import { ProviderTransferHooks } from '../../types/hooks';

export interface TransferHandlerDeps {
  store: TransferStore;
  /**
   * Called before every outbound HTTP request to a Consumer's callbackAddress.
   * Return a full Authorization header value (e.g. 'Bearer <token>') or
   * undefined to send no Authorization header.
   */
  getOutboundToken?: (consumerCallbackUrl: string) => Promise<string | undefined>;
  /** Optional hooks fired after each inbound Consumer message is processed. */
  hooks?: ProviderTransferHooks;
}

// ---------------------------------------------------------------------------
// Internal outbound HTTP helper
// ---------------------------------------------------------------------------

async function providerPost(
  url: string,
  body: unknown,
  getToken?: (url: string) => Promise<string | undefined>
): Promise<void> {
  const token = getToken ? await getToken(url) : undefined;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Provider callback failed: ${res.status} ${url}\n${text}`);
  }
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
      fireHook(deps.hooks?.onTransferRequested, transfer);
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
      fireHook(deps.hooks?.onTransferRestartedByConsumer, updated);
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
      fireHook(deps.hooks?.onTransferCompletedByConsumer, updated);
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
      fireHook(deps.hooks?.onTransferSuspendedByConsumer, updated);
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
      fireHook(deps.hooks?.onTransferTerminatedByConsumer, updated);
    } catch (err) { next(err); }
  }

  // -------------------------------------------------------------------------
  // Provider-initiated helpers — update local state AND notify the Consumer
  // via their callbackAddress. All methods are safe to await in business logic.
  // -------------------------------------------------------------------------

  /**
   * Transitions REQUESTED → STARTED (Provider starts the transfer) and POSTs
   * TransferStartMessage to the Consumer's callbackAddress (§10.3.2).
   *
   * Pass `dataAddress` for pull transfers where the Provider supplies the
   * endpoint credentials at start time.
   */
  async function providerStartTransfer(
    providerPid: string,
    dataAddress?: DataAddress
  ): Promise<TransferProcess> {
    const transfer = await deps.store.findByProviderPid(providerPid);
    if (!transfer) throw new Error(`Transfer process not found: ${providerPid}`);
    if (!transfer.callbackAddress) throw new Error(`Transfer '${providerPid}' has no callbackAddress.`);

    const nextState = nextTransferState(transfer.state, 'TransferStartMessage', 'PROVIDER');
    const updated = await deps.store.update(providerPid, {
      state: nextState,
      ...(dataAddress ? { dataAddress } : {}),
    });

    const msg: TransferStartMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferStartMessage',
      providerPid: updated.providerPid,
      consumerPid: updated.consumerPid,
      ...(updated.dataAddress ? { dataAddress: updated.dataAddress } : {}),
    };

    await providerPost(
      buildUrl(transfer.callbackAddress, `/transfers/${encodeURIComponent(updated.consumerPid)}/start`),
      msg,
      deps.getOutboundToken
    );

    return updated;
  }

  /**
   * Transitions STARTED → COMPLETED (Provider signals completion) and POSTs
   * TransferCompletionMessage to the Consumer's callbackAddress (§10.3.3).
   */
  async function providerCompleteTransfer(providerPid: string): Promise<TransferProcess> {
    const transfer = await deps.store.findByProviderPid(providerPid);
    if (!transfer) throw new Error(`Transfer process not found: ${providerPid}`);
    if (!transfer.callbackAddress) throw new Error(`Transfer '${providerPid}' has no callbackAddress.`);

    const nextState = nextTransferState(transfer.state, 'TransferCompletionMessage', 'PROVIDER');
    const updated = await deps.store.update(providerPid, { state: nextState });

    const msg: TransferCompletionMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferCompletionMessage',
      providerPid: updated.providerPid,
      consumerPid: updated.consumerPid,
    };

    await providerPost(
      buildUrl(transfer.callbackAddress, `/transfers/${encodeURIComponent(updated.consumerPid)}/completion`),
      msg,
      deps.getOutboundToken
    );

    return updated;
  }

  /**
   * Transitions STARTED → SUSPENDED and POSTs TransferSuspensionMessage to
   * the Consumer's callbackAddress (§10.3.5).
   */
  async function providerSuspendTransfer(
    providerPid: string,
    opts?: { code?: string; reason?: string[] }
  ): Promise<TransferProcess> {
    const transfer = await deps.store.findByProviderPid(providerPid);
    if (!transfer) throw new Error(`Transfer process not found: ${providerPid}`);
    if (!transfer.callbackAddress) throw new Error(`Transfer '${providerPid}' has no callbackAddress.`);

    const nextState = nextTransferState(transfer.state, 'TransferSuspensionMessage', 'PROVIDER');
    const updated = await deps.store.update(providerPid, { state: nextState });

    const msg: TransferSuspensionMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferSuspensionMessage',
      providerPid: updated.providerPid,
      consumerPid: updated.consumerPid,
      ...opts,
    };

    await providerPost(
      buildUrl(transfer.callbackAddress, `/transfers/${encodeURIComponent(updated.consumerPid)}/suspension`),
      msg,
      deps.getOutboundToken
    );

    return updated;
  }

  /**
   * Terminates the transfer from the provider side and POSTs
   * TransferTerminationMessage to the Consumer's callbackAddress (§10.3.4).
   */
  async function providerTerminateTransfer(
    providerPid: string,
    opts?: { code?: string; reason?: string[] }
  ): Promise<TransferProcess> {
    const transfer = await deps.store.findByProviderPid(providerPid);
    if (!transfer) throw new Error(`Transfer process not found: ${providerPid}`);
    if (!transfer.callbackAddress) throw new Error(`Transfer '${providerPid}' has no callbackAddress.`);

    const nextState = nextTransferState(transfer.state, 'TransferTerminationMessage', 'PROVIDER');
    const updated = await deps.store.update(providerPid, { state: nextState });

    const msg: TransferTerminationMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferTerminationMessage',
      providerPid: updated.providerPid,
      consumerPid: updated.consumerPid,
      ...opts,
    };

    await providerPost(
      buildUrl(transfer.callbackAddress, `/transfers/${encodeURIComponent(updated.consumerPid)}/termination`),
      msg,
      deps.getOutboundToken
    );

    return updated;
  }

  return {
    getTransferProcess,
    requestTransfer,
    startTransfer,
    completeTransfer,
    suspendTransfer,
    terminateTransfer,
    providerStartTransfer,
    providerCompleteTransfer,
    providerSuspendTransfer,
    providerTerminateTransfer,
  };
}
