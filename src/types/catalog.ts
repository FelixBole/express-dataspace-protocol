// ---------------------------------------------------------------------------
// Catalog Protocol types
// Reference: §5 & §6 of DSP 2025-1
// ---------------------------------------------------------------------------

import { DspContext } from './common';

// ---------------------------------------------------------------------------
// ODRL / Policy primitives (Appendix A)
// ---------------------------------------------------------------------------

export type Action = string;

export interface Constraint {
  leftOperand: string;
  operator: string;
  rightOperand: string;
  and?: Constraint[];
  or?: Constraint[];
  andSequence?: Constraint[];
  xone?: Constraint[];
}

export interface Rule {
  action: Action;
  constraint?: Constraint[];
}

export type Permission = Rule;
export type Prohibition = Rule;
export interface Duty {
  action?: Action;
  constraint?: Constraint[];
}

// ---------------------------------------------------------------------------
// Offer (Appendix A)
// ---------------------------------------------------------------------------

export interface Offer {
  '@id': string;
  '@type'?: 'Offer';
  permission?: Permission[];
  prohibition?: Prohibition[];
  obligation?: Duty[];
  profile?: string | string[];
  /** MUST be set when offer appears inside a message (not a Catalog/Dataset) */
  target?: string;
}

// ---------------------------------------------------------------------------
// Dataset, Distribution, DataService (Appendix A / §5.3.2)
// ---------------------------------------------------------------------------

export interface DataService {
  '@id': string;
  '@type'?: 'DataService';
  endpointURL?: string;
  servesDataset?: Dataset[];
}

export interface Distribution {
  '@type'?: 'Distribution';
  format: string;
  accessService: string | DataService;
  hasPolicy?: Offer[];
}

export interface Dataset {
  '@id': string;
  '@type'?: 'Dataset';
  hasPolicy: Offer[];
  distribution: Distribution[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Catalog (§5.3.1)
// ---------------------------------------------------------------------------

export interface Catalog {
  '@context'?: DspContext;
  '@id': string;
  '@type': 'Catalog';
  participantId?: string;
  dataset?: Dataset[];
  service?: DataService[];
  distribution?: Distribution[];
  catalog?: Catalog[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Catalog Protocol messages (§5.2)
// ---------------------------------------------------------------------------

export interface CatalogRequestMessage {
  '@context': DspContext;
  '@type': 'CatalogRequestMessage';
  /** Optional, implementation-specific filter expression */
  filter?: unknown;
}

export interface DatasetRequestMessage {
  '@context': DspContext;
  '@type': 'DatasetRequestMessage';
  dataset: string;
}

// ---------------------------------------------------------------------------
// Catalog Error (§5.3.3)
// ---------------------------------------------------------------------------

export interface CatalogError {
  '@context': DspContext;
  '@type': 'CatalogError';
  code?: string;
  reason?: string[];
}
