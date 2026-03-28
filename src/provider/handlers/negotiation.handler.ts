import { Request, Response, NextFunction } from "express";
import { NegotiationStore } from "../../store/interfaces";
import {
	ContractNegotiation,
	NegotiationState,
	ContractRequestMessage,
	ContractOfferMessage,
	ContractAgreementMessage,
	ContractNegotiationEventMessage,
	ContractNegotiationTerminationMessage,
	Agreement,
	MessageOffer,
} from "../../types/negotiation";
import { DSP_CONTEXT } from "../../types/common";
import {
	nextNegotiationState,
	InvalidNegotiationTransitionError,
	NegotiationMessageType,
} from "../../state-machines/negotiation.state-machine";
import { generateId, nowIso, buildUrl, fireHook } from "../../utils";
import { ProviderNegotiationHooks } from "../../types/hooks";

export interface NegotiationHandlerDeps {
	store: NegotiationStore;
	/**
	 * Called before every outbound HTTP request to a Consumer's callbackAddress.
	 * Return a full Authorization header value (e.g. 'Bearer <token>') or
	 * undefined to send no Authorization header.
	 */
	getOutboundToken?: (
		consumerCallbackUrl: string,
	) => Promise<string | undefined>;
	/**
	 * The public base URL of this Provider's DSP API.
	 * Used as `callbackAddress` in outbound ContractOfferMessage bodies so the
	 * Consumer knows where to call back. Example: 'https://provider.example/dsp'
	 */
	providerAddress?: string;
	/** Optional hooks fired after each inbound Consumer message is processed. */
	hooks?: ProviderNegotiationHooks;
}

// ---------------------------------------------------------------------------
// Internal outbound HTTP helper
// ---------------------------------------------------------------------------

async function providerPost(
	url: string,
	body: unknown,
	getToken?: (url: string) => Promise<string | undefined>,
): Promise<void> {
	const token = getToken ? await getToken(url) : undefined;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (token) headers["Authorization"] = token;

	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(
			`Provider callback failed: ${res.status} ${url}\n${text}`,
		);
	}
}

function negotiationResponse(n: ContractNegotiation) {
	return {
		"@context": [DSP_CONTEXT],
		"@type": "ContractNegotiation",
		providerPid: n.providerPid,
		consumerPid: n.consumerPid,
		state: n.state,
	};
}

function notFound(res: Response, providerPid: string) {
	// §8.1.2.2 — return 404 when not found or unauthorised
	res.status(404).json({
		"@context": [DSP_CONTEXT],
		"@type": "ContractNegotiationError",
		code: "NotFound",
		reason: [`Negotiation '${providerPid}' not found.`],
	});
}

function badTransition(res: Response, err: InvalidNegotiationTransitionError) {
	res.status(400).json({
		"@context": [DSP_CONTEXT],
		"@type": "ContractNegotiationError",
		code: "InvalidStateTransition",
		reason: [err.message],
	});
}

export function makeNegotiationHandlers(deps: NegotiationHandlerDeps) {
	/**
	 * GET /negotiations/:providerPid — §8.2.1
	 */
	async function getNegotiation(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const negotiation = await deps.store.findByProviderPid(
				req.params.providerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.providerPid);
				return;
			}
			res.status(200).json(negotiationResponse(negotiation));
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/request — §8.2.2
	 *
	 * - No `providerPid` in body → Consumer initiates a new negotiation (201).
	 * - `providerPid` present → Consumer re-requests on an existing negotiation,
	 *   e.g. after receiving a Provider counter-offer (200).
	 */
	async function requestNegotiation(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractRequestMessage;

			// ── Re-request on an existing negotiation ──────────────────────
			if (body.providerPid) {
				const existing = await deps.store.findByProviderPid(
					body.providerPid,
				);
				if (!existing) {
					notFound(res, body.providerPid);
					return;
				}

				let nextState: NegotiationState;
				try {
					nextState = nextNegotiationState(
						existing.state,
						"ContractRequestMessage",
						"CONSUMER",
					);
				} catch (err) {
					if (err instanceof InvalidNegotiationTransitionError) {
						badTransition(res, err);
						return;
					}
					throw err;
				}

				const updated = await deps.store.update(existing.providerPid, {
					state: nextState,
					offer: body.offer,
					callbackAddress: body.callbackAddress,
				});
				res.status(200).json(negotiationResponse(updated));
				fireHook(deps.hooks?.onNegotiationReRequested, updated);
				return;
			}

			// ── New negotiation ─────────────────────────────────────────────
			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					null,
					"ContractRequestMessage",
					"CONSUMER",
				);
			} catch (err) {
				if (err instanceof InvalidNegotiationTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			const negotiation = await deps.store.create({
				"@type": "ContractNegotiation",
				providerPid: `urn:uuid:${generateId()}`,
				consumerPid: body.consumerPid,
				state: nextState,
				callbackAddress: body.callbackAddress,
				offer: body.offer,
			});

			res.status(201).json(negotiationResponse(negotiation));
			fireHook(deps.hooks?.onNegotiationRequested, negotiation);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:providerPid/request — §8.2.3 — Consumer counter-offer
	 */
	async function makeContractOffer(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractRequestMessage;
			const negotiation = await deps.store.findByProviderPid(
				req.params.providerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.providerPid);
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					"ContractRequestMessage",
					"CONSUMER",
				);
			} catch (err) {
				if (err instanceof InvalidNegotiationTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			const updated = await deps.store.update(negotiation.providerPid, {
				state: nextState,
				offer: body.offer,
			});
			res.status(200).json(negotiationResponse(updated));
			fireHook(deps.hooks?.onNegotiationRequested, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:providerPid/events — §8.2.4
	 * Consumer sends ACCEPTED event.
	 */
	async function acceptNegotiation(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractNegotiationEventMessage;
			const negotiation = await deps.store.findByProviderPid(
				req.params.providerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.providerPid);
				return;
			}

			const msgType: NegotiationMessageType =
				body.eventType === "FINALIZED"
					? "ContractNegotiationEventMessage:FINALIZED"
					: "ContractNegotiationEventMessage:ACCEPTED";

			// Only ACCEPTED is valid from Consumer at this endpoint
			if (body.eventType === "FINALIZED") {
				res.status(400).json({
					"@context": [DSP_CONTEXT],
					"@type": "ContractNegotiationError",
					code: "InvalidEventType",
					reason: ["Consumer MUST NOT send FINALIZED event type."],
				});
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					msgType,
					"CONSUMER",
				);
			} catch (err) {
				if (err instanceof InvalidNegotiationTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			const updated = await deps.store.update(negotiation.providerPid, {
				state: nextState,
			});
			res.status(200).json(negotiationResponse(updated));
			fireHook(deps.hooks?.onNegotiationAccepted, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:providerPid/agreement/verification — §8.2.5
	 * Consumer verifies the agreement.
	 */
	async function verifyAgreement(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const negotiation = await deps.store.findByProviderPid(
				req.params.providerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.providerPid);
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					"ContractAgreementVerificationMessage",
					"CONSUMER",
				);
			} catch (err) {
				if (err instanceof InvalidNegotiationTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			const updated = await deps.store.update(negotiation.providerPid, {
				state: nextState,
			});
			res.status(200).json(negotiationResponse(updated));
			fireHook(deps.hooks?.onAgreementVerified, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:providerPid/termination — §8.2.6
	 * Consumer terminates the negotiation.
	 */
	async function terminateNegotiation(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractNegotiationTerminationMessage;
			const negotiation = await deps.store.findByProviderPid(
				req.params.providerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.providerPid);
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					"ContractNegotiationTerminationMessage",
					"CONSUMER",
				);
			} catch (err) {
				if (err instanceof InvalidNegotiationTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			void body;
			const updated = await deps.store.update(negotiation.providerPid, {
				state: nextState,
			});
			res.status(200).json(negotiationResponse(updated));
			fireHook(deps.hooks?.onNegotiationTerminated, updated);
		} catch (err) {
			next(err);
		}
	}

	// -------------------------------------------------------------------------
	// Provider-initiated helpers — update local state AND notify the Consumer
	// via their callbackAddress. All methods are safe to await in business logic.
	// -------------------------------------------------------------------------

	/**
	 * Transitions ACCEPTED → AGREED, attaches the agreement, and POSTs
	 * ContractAgreementMessage to the Consumer's callbackAddress (§8.3.5).
	 */
	async function sendAgreement(
		providerPid: string,
		agreement: Agreement,
	): Promise<ContractNegotiation> {
		const negotiation = await deps.store.findByProviderPid(providerPid);
		if (!negotiation)
			throw new Error(`Negotiation not found: ${providerPid}`);
		if (!negotiation.callbackAddress)
			throw new Error(
				`Negotiation '${providerPid}' has no callbackAddress.`,
			);

		const nextState = nextNegotiationState(
			negotiation.state,
			"ContractAgreementMessage",
			"PROVIDER",
		);
		const updated = await deps.store.update(providerPid, {
			state: nextState,
			agreement: {
				...agreement,
				timestamp: agreement.timestamp ?? nowIso(),
			},
		});

		const msg: ContractAgreementMessage = {
			"@context": [DSP_CONTEXT],
			"@type": "ContractAgreementMessage",
			providerPid: updated.providerPid,
			consumerPid: updated.consumerPid,
			agreement: updated.agreement!,
		};

		await providerPost(
			buildUrl(
				negotiation.callbackAddress,
				`/negotiations/${encodeURIComponent(updated.consumerPid)}/agreement`,
			),
			msg,
			deps.getOutboundToken,
		);

		return updated;
	}

	/**
	 * Transitions VERIFIED → FINALIZED and POSTs ContractNegotiationEventMessage
	 * (eventType: FINALIZED) to the Consumer's callbackAddress (§8.3.6).
	 */
	async function finalizeNegotiation(
		providerPid: string,
	): Promise<ContractNegotiation> {
		const negotiation = await deps.store.findByProviderPid(providerPid);
		if (!negotiation)
			throw new Error(`Negotiation not found: ${providerPid}`);
		if (!negotiation.callbackAddress)
			throw new Error(
				`Negotiation '${providerPid}' has no callbackAddress.`,
			);

		const nextState = nextNegotiationState(
			negotiation.state,
			"ContractNegotiationEventMessage:FINALIZED",
			"PROVIDER",
		);
		const updated = await deps.store.update(providerPid, {
			state: nextState,
		});

		const msg: ContractNegotiationEventMessage = {
			"@context": [DSP_CONTEXT],
			"@type": "ContractNegotiationEventMessage",
			providerPid: updated.providerPid,
			consumerPid: updated.consumerPid,
			eventType: "FINALIZED",
		};

		await providerPost(
			buildUrl(
				negotiation.callbackAddress,
				`/negotiations/${encodeURIComponent(updated.consumerPid)}/events`,
			),
			msg,
			deps.getOutboundToken,
		);

		return updated;
	}

	/**
	 * Terminates the negotiation from the provider side and POSTs
	 * ContractNegotiationTerminationMessage to the Consumer's callbackAddress (§8.3.7).
	 */
	async function terminateNegotiationAsProvider(
		providerPid: string,
		opts?: { code?: string; reason?: string[] },
	): Promise<ContractNegotiation> {
		const negotiation = await deps.store.findByProviderPid(providerPid);
		if (!negotiation)
			throw new Error(`Negotiation not found: ${providerPid}`);
		if (!negotiation.callbackAddress)
			throw new Error(
				`Negotiation '${providerPid}' has no callbackAddress.`,
			);

		const nextState = nextNegotiationState(
			negotiation.state,
			"ContractNegotiationTerminationMessage",
			"PROVIDER",
		);
		const updated = await deps.store.update(providerPid, {
			state: nextState,
		});

		const msg: ContractNegotiationTerminationMessage = {
			"@context": [DSP_CONTEXT],
			"@type": "ContractNegotiationTerminationMessage",
			providerPid: updated.providerPid,
			consumerPid: updated.consumerPid,
			...opts,
		};

		await providerPost(
			buildUrl(
				negotiation.callbackAddress,
				`/negotiations/${encodeURIComponent(updated.consumerPid)}/termination`,
			),
			msg,
			deps.getOutboundToken,
		);

		return updated;
	}

	/**
	 * Provider sends a counter-offer on an existing negotiation (REQUESTED → OFFERED)
	 * and POSTs ContractOfferMessage to the Consumer's callbackAddress (§8.3.4).
	 *
	 * Requires `providerAddress` to be set in `DspProviderOptions` so the Consumer
	 * knows where to call back.
	 */
	async function sendCounterOffer(
		providerPid: string,
		offer: MessageOffer,
	): Promise<ContractNegotiation> {
		const negotiation = await deps.store.findByProviderPid(providerPid);
		if (!negotiation)
			throw new Error(`Negotiation not found: ${providerPid}`);
		if (!negotiation.callbackAddress)
			throw new Error(
				`Negotiation '${providerPid}' has no callbackAddress.`,
			);
		if (!deps.providerAddress)
			throw new Error(
				"providerAddress must be set in DspProviderOptions to send counter-offers.",
			);

		const nextState = nextNegotiationState(
			negotiation.state,
			"ContractOfferMessage",
			"PROVIDER",
		);
		const updated = await deps.store.update(providerPid, {
			state: nextState,
		});

		const msg: ContractOfferMessage = {
			"@context": [DSP_CONTEXT],
			"@type": "ContractOfferMessage",
			providerPid: updated.providerPid,
			consumerPid: updated.consumerPid,
			offer,
			callbackAddress: deps.providerAddress,
		};

		await providerPost(
			buildUrl(
				negotiation.callbackAddress,
				`/negotiations/${encodeURIComponent(updated.consumerPid)}/offers`,
			),
			msg,
			deps.getOutboundToken,
		);

		return updated;
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
		terminateNegotiationAsProvider,
		sendCounterOffer,
	};
}
