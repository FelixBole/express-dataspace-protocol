import { DSP_CONTEXT } from '../../types/common';
import {
  ContractNegotiation,
  ContractRequestMessage,
  ContractNegotiationTerminationMessage,
  MessageOffer,
  NegotiationState,
} from '../../types/negotiation';
import { DspClientError, CatalogClientDeps } from './catalog.client';
import { NegotiationStore } from '../../store/interfaces';
import { buildUrl, generateId } from '../../utils';

export interface NegotiationClientDeps extends CatalogClientDeps {
  /**
   * Consumer-side negotiation store.
   * When provided, `requestNegotiation` persists the outbound negotiation so
   * the callback router can look it up by consumerPid when the Provider
   * sends counter-offers, agreements, and events.
   */
  store?: NegotiationStore;
}

export function makeNegotiationClient(deps: NegotiationClientDeps) {
  async function dspPost<T>(
    url: string,
    body: unknown,
    getToken?: (base: string) => Promise<string | undefined>
  ): Promise<T> {
    const base = new URL(url).origin;
    const token = getToken ? await getToken(base) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = token;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new DspClientError(res.status, url, text);
    }

    // Some endpoints return 200 with no body; guard against empty response
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  /**
   * POST <providerBase>/negotiations/request — §8.2.2
   * Initiate a new contract negotiation.
   */
  async function requestNegotiation(
    providerBaseUrl: string,
    opts: {
      offer: MessageOffer;
      callbackAddress: string;
      consumerPid?: string;
    }
  ): Promise<ContractNegotiation> {
    const msg: ContractRequestMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'ContractRequestMessage',
      consumerPid: opts.consumerPid ?? `urn:uuid:${generateId()}`,
      offer: opts.offer,
      callbackAddress: opts.callbackAddress,
    };

    const result = await dspPost<ContractNegotiation>(
      buildUrl(providerBaseUrl, '/negotiations/request'),
      msg,
      deps.getOutboundToken
    );

    // Persist the negotiation in the Consumer's local store so the callback
    // router can find it by consumerPid when the Provider sends back offers,
    // agreements, and events.
    if (deps.store) {
      await deps.store.create({
        '@type': 'ContractNegotiation',
        providerPid: result.providerPid,
        consumerPid: msg.consumerPid,
        state: NegotiationState.REQUESTED,
        offer: opts.offer,
        callbackAddress: opts.callbackAddress,
      });
    }

    return result;
  }

  /**
   * POST <providerBase>/negotiations/:providerPid/request — §8.2.3
   * Consumer makes a counter-offer on an existing negotiation.
   */
  async function counterOffer(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string,
    offer: MessageOffer
  ): Promise<void> {
    const msg: ContractRequestMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'ContractRequestMessage',
      providerPid,
      consumerPid,
      offer,
      callbackAddress: '', // provider already has it — send empty per spec (optional field here)
    };

    await dspPost(
      buildUrl(providerBaseUrl, `/negotiations/${encodeURIComponent(providerPid)}/request`),
      msg,
      deps.getOutboundToken
    );

    // Return to REQUESTED state on the consumer side so that when the Provider
    // sends another ContractOfferMessage, receiveOffer finds state REQUESTED
    // (the only valid pre-condition for a provider counter-offer).
    if (deps.store) {
      await deps.store.update(providerPid, { state: NegotiationState.REQUESTED, offer });
    }
  }

  /**
   * POST <providerBase>/negotiations/:providerPid/events — §8.2.4
   * Consumer sends ACCEPTED event.
   */
  async function acceptNegotiation(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string
  ): Promise<void> {
    await dspPost(
      buildUrl(providerBaseUrl, `/negotiations/${encodeURIComponent(providerPid)}/events`),
      {
        '@context': [DSP_CONTEXT],
        '@type': 'ContractNegotiationEventMessage',
        providerPid,
        consumerPid,
        eventType: 'ACCEPTED',
      },
      deps.getOutboundToken
    );

    // Advance consumer's local state OFFERED → ACCEPTED so that when the
    // Provider sends ContractAgreementMessage, receiveAgreement finds the
    // correct pre-condition state.
    if (deps.store) {
      await deps.store.update(providerPid, { state: NegotiationState.ACCEPTED });
    }
  }

  /**
   * POST <providerBase>/negotiations/:providerPid/agreement/verification — §8.2.5
   * Consumer verifies the agreement.
   */
  async function verifyAgreement(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string
  ): Promise<void> {
    await dspPost(
      buildUrl(
        providerBaseUrl,
        `/negotiations/${encodeURIComponent(providerPid)}/agreement/verification`
      ),
      {
        '@context': [DSP_CONTEXT],
        '@type': 'ContractAgreementVerificationMessage',
        providerPid,
        consumerPid,
      },
      deps.getOutboundToken
    );

    // Advance consumer's local state AGREED → VERIFIED so that when the
    // Provider sends ContractNegotiationEventMessage:FINALIZED, receiveEvent
    // finds the correct pre-condition state.
    if (deps.store) {
      await deps.store.update(providerPid, { state: NegotiationState.VERIFIED });
    }
  }

  /**
   * POST <providerBase>/negotiations/:providerPid/termination — §8.2.6
   */
  async function terminateNegotiation(
    providerBaseUrl: string,
    providerPid: string,
    consumerPid: string,
    opts?: { code?: string; reason?: string[] }
  ): Promise<void> {
    const msg: ContractNegotiationTerminationMessage = {
      '@context': [DSP_CONTEXT],
      '@type': 'ContractNegotiationTerminationMessage',
      providerPid,
      consumerPid,
      ...opts,
    };
    await dspPost(
      buildUrl(providerBaseUrl, `/negotiations/${encodeURIComponent(providerPid)}/termination`),
      msg,
      deps.getOutboundToken
    );

    if (deps.store) {
      await deps.store.update(providerPid, { state: NegotiationState.TERMINATED });
    }
  }

  return {
    requestNegotiation,
    counterOffer,
    acceptNegotiation,
    verifyAgreement,
    terminateNegotiation,
  };
}
