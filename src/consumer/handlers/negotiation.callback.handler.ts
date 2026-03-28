import { Request, Response, NextFunction } from "express";
import { NegotiationStore } from "../../store/interfaces";
import {
	ContractNegotiation,
	NegotiationState,
	ContractOfferMessage,
	ContractAgreementMessage,
	ContractNegotiationEventMessage,
	ContractNegotiationTerminationMessage,
} from "../../types/negotiation";
import { DSP_CONTEXT } from "../../types/common";
import {
	nextNegotiationState,
	InvalidNegotiationTransitionError,
	NegotiationMessageType,
} from "../../state-machines/negotiation.state-machine";
import { generateId, fireHook } from "../../utils";
import { ConsumerNegotiationHooks } from "../../types/hooks";

export interface ConsumerNegotiationHandlerDeps {
	store: NegotiationStore;
	/** Optional hooks fired after each inbound Provider message is processed. */
	hooks?: ConsumerNegotiationHooks;
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

function notFound(res: Response, consumerPid: string) {
	res.status(404).json({
		"@context": [DSP_CONTEXT],
		"@type": "ContractNegotiationError",
		code: "NotFound",
		reason: [`Negotiation '${consumerPid}' not found.`],
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

export function makeConsumerNegotiationHandlers(
	deps: ConsumerNegotiationHandlerDeps,
) {
	/**
	 * GET /negotiations/:consumerPid — §8.3.2
	 * Provider reads Consumer's negotiation state.
	 */
	async function getNegotiation(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const negotiation = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.consumerPid);
				return;
			}
			res.status(200).json(negotiationResponse(negotiation));
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/offers — §8.3.3
	 * Provider initiates a new negotiation with an offer. Consumer must create entry.
	 */
	async function receiveInitialOffer(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractOfferMessage;

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					null,
					"ContractOfferMessage",
					"PROVIDER",
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
				providerPid: body.providerPid,
				consumerPid: `urn:uuid:${generateId()}`,
				state: nextState,
				callbackAddress: body.callbackAddress,
				offer: body.offer,
			});

			res.status(201).json(negotiationResponse(negotiation));
			fireHook(deps.hooks?.onOfferReceived, negotiation);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:consumerPid/offers — §8.3.4
	 * Provider makes a counter-offer on existing negotiation.
	 */
	async function receiveOffer(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractOfferMessage;
			const negotiation = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					"ContractOfferMessage",
					"PROVIDER",
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
			fireHook(deps.hooks?.onOfferReceived, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:consumerPid/agreement — §8.3.5
	 * Provider sends agreement; Consumer transitions to AGREED.
	 */
	async function receiveAgreement(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractAgreementMessage;
			const negotiation = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					"ContractAgreementMessage",
					"PROVIDER",
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
				agreement: body.agreement,
			});
			res.status(200).json(negotiationResponse(updated));
			fireHook(deps.hooks?.onAgreementReceived, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:consumerPid/events — §8.3.6
	 * Provider sends FINALIZED event.
	 */
	async function receiveEvent(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractNegotiationEventMessage;
			const negotiation = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.consumerPid);
				return;
			}

			if (body.eventType === "ACCEPTED") {
				res.status(400).json({
					"@context": [DSP_CONTEXT],
					"@type": "ContractNegotiationError",
					code: "InvalidEventType",
					reason: ["Provider MUST NOT send ACCEPTED event type."],
				});
				return;
			}

			const msgType: NegotiationMessageType =
				"ContractNegotiationEventMessage:FINALIZED";

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					msgType,
					"PROVIDER",
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
			fireHook(deps.hooks?.onNegotiationFinalized, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /negotiations/:consumerPid/termination — §8.3.7
	 * Provider terminates.
	 */
	async function receiveTermination(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as ContractNegotiationTerminationMessage;
			const negotiation = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!negotiation) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: NegotiationState;
			try {
				nextState = nextNegotiationState(
					negotiation.state,
					"ContractNegotiationTerminationMessage",
					"PROVIDER",
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

	return {
		getNegotiation,
		receiveInitialOffer,
		receiveOffer,
		receiveAgreement,
		receiveEvent,
		receiveTermination,
	};
}
