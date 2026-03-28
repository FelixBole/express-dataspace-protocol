import { DSP_CONTEXT, DataAddress } from '../../types/common';
import {
  TransferProcess,
  TransferRequestMessage,
  TransferTerminationMessage,
  TransferSuspensionMessage,
  TransferState,
} from '../../types/transfer';
import { DspClientError, CatalogClientDeps } from './catalog.client';
import { TransferStore } from '../../store/interfaces';
import { buildUrl, generateId } from '../../utils';

export interface TransferClientDeps extends CatalogClientDeps {
  /**
   * Consumer-side transfer store.
   * When provided, `requestTransfer` persists the outbound transfer so the
   * callback router can look it up by consumerPid when the Provider sends
   * start, completion, suspension, and termination messages.
   */
  store?: TransferStore;
}

export function makeTransferClient(deps: TransferClientDeps) {
  async function dspPost<T>(
    url: string,
    body: unknown,
    getToken?: (base: string) => Promise<string | undefined>
  ): Promise<T> {
    const base = new URL(url).origin;
    const token = getToken ? await getToken(base) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = token;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new DspClientError(res.status, url, text);
    }

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  /**
   * POST <providerBase>/transfers/request — §10.2.2
   * Initiate a new transfer process.
   */
  async function requestTransfer(
    providerBaseUrl: string,
    opts: {
      agreementId: string;
      format: string;
      callbackAddress: string;
      dataAddress?: DataAddress;
      consumerPid?: string;
    }
  ): Promise<TransferProcess> {
    const msg: TransferRequestMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferRequestMessage',
      consumerPid: opts.consumerPid ?? `urn:uuid:${generateId()}`,
      agreementId: opts.agreementId,
      format: opts.format,
      callbackAddress: opts.callbackAddress,
      ...(opts.dataAddress ? { dataAddress: opts.dataAddress } : {}),
    };

    const result = await dspPost<TransferProcess>(
      buildUrl(providerBaseUrl, '/transfers/request'),
      msg,
      deps.getOutboundToken
    );

    // Persist the transfer in the Consumer's local store so the callback
    // router can find it by consumerPid when the Provider sends back start,
    // completion, suspension, and termination messages.
    if (deps.store) {
      await deps.store.create({
        '@type': 'TransferProcess',
        providerPid: result.providerPid,
        consumerPid: msg.consumerPid,
        state: TransferState.REQUESTED,
        agreementId: opts.agreementId,
        format: opts.format,
        callbackAddress: opts.callbackAddress,
      });
    }

    return result;
  }

  /**
   * POST <providerBase>/transfers/:providerPid/completion — §10.2.4
   */
  async function completeTransfer(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string
  ): Promise<void> {
    await dspPost(
      buildUrl(providerBaseUrl, `/transfers/${encodeURIComponent(providerPid)}/completion`),
      {
        '@context': [DSP_CONTEXT],
        '@type': 'TransferCompletionMessage',
        providerPid,
        consumerPid,
      },
      deps.getOutboundToken
    );

    if (deps.store) {
      await deps.store.update(providerPid, { state: TransferState.COMPLETED });
    }
  }

  /**
   * POST <providerBase>/transfers/:providerPid/suspension — §10.2.6
   */
  async function suspendTransfer(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string,
    opts?: { code?: string; reason?: string[] }
  ): Promise<void> {
    const msg: TransferSuspensionMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferSuspensionMessage',
      providerPid,
      consumerPid,
      ...opts,
    };
    await dspPost(
      buildUrl(providerBaseUrl, `/transfers/${encodeURIComponent(providerPid)}/suspension`),
      msg,
      deps.getOutboundToken
    );

    // SUSPENDED is the correct pre-condition state for a Consumer-initiated
    // restart (TransferStartMessage) and for Provider-side restart callbacks.
    if (deps.store) {
      await deps.store.update(providerPid, { state: TransferState.SUSPENDED });
    }
  }

  /**
   * POST <providerBase>/transfers/:providerPid/termination — §10.2.5
   */
  async function terminateTransfer(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string,
    opts?: { code?: string; reason?: string[] }
  ): Promise<void> {
    const msg: TransferTerminationMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'TransferTerminationMessage',
      providerPid,
      consumerPid,
      ...opts,
    };
    await dspPost(
      buildUrl(providerBaseUrl, `/transfers/${encodeURIComponent(providerPid)}/termination`),
      msg,
      deps.getOutboundToken
    );

    if (deps.store) {
      await deps.store.update(providerPid, { state: TransferState.TERMINATED });
    }
  }

  return { requestTransfer, completeTransfer, suspendTransfer, terminateTransfer };
}
