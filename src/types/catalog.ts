// ---------------------------------------------------------------------------
// Catalog Protocol types
// Reference: §5 & §6 of DSP 2025-1
// ---------------------------------------------------------------------------

import { DspContext } from "./common";

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

/**
 * A concrete [Policy](https://www.w3.org/TR/odrl-model/#policy-has) associated
 * with a specific Dataset.
 */
export interface Offer {
	/**
	 * The "@id" of the offer.
	 *
	 * When a consumer makes a contract request for a dataset, this "@id" is
	 * points to the chosen dataset.hasPolicy entry, which is an array of offers.
	 */
	"@id": string;
	"@type"?: "Offer";
	permission?: Permission[];
	prohibition?: Prohibition[];
	obligation?: Duty[];
	profile?: string | string[];
	/**
	 * Reference to the Dataset this offer applies to.
	 *
	 * MUST be set when offer appears inside a message (not a Catalog/Dataset)
	 */
	target?: string;
}

// ---------------------------------------------------------------------------
// Dataset, Distribution, DataService (Appendix A / §5.3.2)
// ---------------------------------------------------------------------------

/**
 * A collection of operations that provides access to one or more datasets
 * or data processing functions.
 *
 * https://www.w3.org/TR/vocab-dcat-3/#Class:Data_Service
 */
export interface DataService {
	"@id": string;
	"@type"?: "DataService";
	endpointURL?: string;
	servesDataset?: Dataset[];
}

/**
 * A specific representation of a Dataset. A dataset might be available in
 * multiple serializations that may differ in various ways, including
 * natural language, media-type or format, schematic organization, temporal
 * and spatial resolution, level of details or profiles (which might specify
 * any or all of the above).
 *
 * Usage note: This represents a general availability of a dataset. It implies
 * no information about the actual access method of the data, i.e., whether by
 * direct download, API, or through a Web page. The use of dcat:downloadURL
 * property indicates directly downloadable distributions.
 *
 * https://www.w3.org/TR/vocab-dcat-3/#Class:Distribution
 */
export interface Distribution {
	"@type"?: "Distribution";
	format: string;
	accessService: string | DataService;
	hasPolicy?: Offer[];
}

/**
 * A collection of data, published or curated by a single agent, and available
 * for access or download in one or more representations.
 *
 * https://www.w3.org/TR/vocab-dcat-3/#Class:Dataset
 */
export interface Dataset {
	"@id": string;
	"@type"?: "Dataset";
	hasPolicy: Offer[];
	distribution: Distribution[];
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Catalog (§5.3.1)
// ---------------------------------------------------------------------------

/**
 * A collection of entries representing Offers that are advertised by a Provider
 */
export interface Catalog {
	"@context"?: DspContext;
	"@id": string;
	"@type": "Catalog";
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

/**
 * Message sent by a Consumer to a Catalog Service in order to retrieve a Catalog.
 */
export interface CatalogRequestMessage {
	"@context": DspContext;
	"@type": "CatalogRequestMessage";
	/** Optional, implementation-specific filter expression */
	filter?: unknown;
}

/**
 * Message sent by a Consumer to request a specific Dataset of a Provider Catalog.
 */
export interface DatasetRequestMessage {
	"@context": DspContext;
	"@type": "DatasetRequestMessage";
	dataset: string;
}

// ---------------------------------------------------------------------------
// Catalog Error (§5.3.3)
// ---------------------------------------------------------------------------

/**
 * Used when an error occurred after a Catalog or Dataset RequestMessage and
 * the Provider cannot provide its Catalog to the requester.
 */
export interface CatalogError {
	"@context": DspContext;
	"@type": "CatalogError";
	code?: string;
	reason?: string[];
}
