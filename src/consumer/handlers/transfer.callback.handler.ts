import { Request, Response, NextFunction } from "express";
import { TransferStore } from "../../store/interfaces";
import {
	TransferProcess,
	TransferState,
	TransferStartMessage,
	TransferSuspensionMessage,
	TransferTerminationMessage,
} from "../../types/transfer";
import { DSP_CONTEXT } from "../../types/common";
import {
	nextTransferState,
	InvalidTransferTransitionError,
} from "../../state-machines/transfer.state-machine";
import { fireHook } from "../../utils";
import { ConsumerTransferHooks } from "../../types/hooks";

export interface ConsumerTransferHandlerDeps {
	store: TransferStore;
	/** Optional hooks fired after each inbound Provider message is processed. */
	hooks?: ConsumerTransferHooks;
}

function transferResponse(t: TransferProcess) {
	return {
		"@context": [DSP_CONTEXT],
		"@type": "TransferProcess",
		providerPid: t.providerPid,
		consumerPid: t.consumerPid,
		state: t.state,
	};
}

function notFound(res: Response, consumerPid: string) {
	res.status(404).json({
		"@context": [DSP_CONTEXT],
		"@type": "TransferError",
		code: "NotFound",
		reason: [`Transfer process '${consumerPid}' not found.`],
	});
}

function badTransition(res: Response, err: InvalidTransferTransitionError) {
	res.status(400).json({
		"@context": [DSP_CONTEXT],
		"@type": "TransferError",
		code: "InvalidStateTransition",
		reason: [err.message],
	});
}

export function makeConsumerTransferHandlers(
	deps: ConsumerTransferHandlerDeps,
) {
	/**
	 * POST /transfers/:consumerPid/start - §10.3.2
	 * Provider signals transfer has started (PULL: includes dataAddress).
	 */
	async function receiveStart(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as TransferStartMessage;
			const transfer = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!transfer) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: TransferState;
			try {
				nextState = nextTransferState(
					transfer.state,
					"TransferStartMessage",
					"PROVIDER",
				);
			} catch (err) {
				if (err instanceof InvalidTransferTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			const updated = await deps.store.update(transfer.providerPid, {
				state: nextState,
				dataAddress: body.dataAddress ?? transfer.dataAddress,
			});
			res.status(200).json(transferResponse(updated));
			fireHook(deps.hooks?.onTransferStarted, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /transfers/:consumerPid/completion - §10.3.3
	 */
	async function receiveCompletion(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const transfer = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!transfer) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: TransferState;
			try {
				nextState = nextTransferState(
					transfer.state,
					"TransferCompletionMessage",
					"PROVIDER",
				);
			} catch (err) {
				if (err instanceof InvalidTransferTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			const updated = await deps.store.update(transfer.providerPid, {
				state: nextState,
			});
			res.status(200).json(transferResponse(updated));
			fireHook(deps.hooks?.onTransferCompleted, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /transfers/:consumerPid/termination - §10.3.4
	 */
	async function receiveTermination(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as TransferTerminationMessage;
			const transfer = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!transfer) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: TransferState;
			try {
				nextState = nextTransferState(
					transfer.state,
					"TransferTerminationMessage",
					"PROVIDER",
				);
			} catch (err) {
				if (err instanceof InvalidTransferTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			void body;
			const updated = await deps.store.update(transfer.providerPid, {
				state: nextState,
			});
			res.status(200).json(transferResponse(updated));
			fireHook(deps.hooks?.onTransferTerminated, updated);
		} catch (err) {
			next(err);
		}
	}

	/**
	 * POST /transfers/:consumerPid/suspension - §10.3.5
	 */
	async function receiveSuspension(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const body = req.body as TransferSuspensionMessage;
			const transfer = await deps.store.findByConsumerPid(
				req.params.consumerPid,
			);
			if (!transfer) {
				notFound(res, req.params.consumerPid);
				return;
			}

			let nextState: TransferState;
			try {
				nextState = nextTransferState(
					transfer.state,
					"TransferSuspensionMessage",
					"PROVIDER",
				);
			} catch (err) {
				if (err instanceof InvalidTransferTransitionError) {
					badTransition(res, err);
					return;
				}
				throw err;
			}

			void body;
			const updated = await deps.store.update(transfer.providerPid, {
				state: nextState,
			});
			res.status(200).json(transferResponse(updated));
			fireHook(deps.hooks?.onTransferSuspended, updated);
		} catch (err) {
			next(err);
		}
	}

	return {
		receiveStart,
		receiveCompletion,
		receiveTermination,
		receiveSuspension,
	};
}
