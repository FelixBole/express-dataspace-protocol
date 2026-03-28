// ---------------------------------------------------------------------------
// Common DSP types shared across Catalog, CNP, and TPP
// Reference: https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/
// ---------------------------------------------------------------------------

export const DSP_CONTEXT = 'https://w3id.org/dspace/2025/1/context.jsonld';

/** JSON-LD @context value used in all outbound DSP messages */
export type DspContext = [typeof DSP_CONTEXT, ...string[]];

// ---------------------------------------------------------------------------
// DataAddress — used in transfer messages (§9.2)
// ---------------------------------------------------------------------------

export interface EndpointProperty {
  '@type': 'EndpointProperty';
  name: string;
  value: string;
}

export interface DataAddress {
  '@type': 'DataAddress';
  endpointType: string;
  endpoint?: string;
  endpointProperties?: EndpointProperty[];
}

// ---------------------------------------------------------------------------
// Version endpoint (§4.3)
// ---------------------------------------------------------------------------

export interface AuthInfo {
  protocol: string;
  version: string;
  profile?: string[];
}

export interface VersionEntry {
  version: string;
  path: string;
  binding: 'HTTPS';
  auth?: AuthInfo;
  serviceId?: string;
  identifierType?: string;
}

export interface VersionResponse {
  '@context': DspContext;
  '@type': 'VersionResponse';
  protocolVersions: VersionEntry[];
}

// ---------------------------------------------------------------------------
// Generic DSP error body
// ---------------------------------------------------------------------------

export interface DspErrorBody {
  '@context': DspContext;
  '@type': string;
  providerPid?: string;
  consumerPid?: string;
  code?: string;
  reason?: string[];
}

// ---------------------------------------------------------------------------
// Actor type — which side is performing an action
// ---------------------------------------------------------------------------

export type DspActor = 'PROVIDER' | 'CONSUMER';
