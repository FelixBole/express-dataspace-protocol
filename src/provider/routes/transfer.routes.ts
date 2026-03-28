import { Router, RequestHandler } from "express";
import {
	makeTransferHandlers,
	TransferHandlerDeps,
} from "../handlers/transfer.handler";

export function makeTransferRouter(
	deps: TransferHandlerDeps,
	auth: RequestHandler,
): Router {
	const router = Router();
	const {
		getTransferProcess,
		requestTransfer,
		startTransfer,
		completeTransfer,
		suspendTransfer,
		terminateTransfer,
	} = makeTransferHandlers(deps);

	// §10.2 Provider path bindings
	router.get("/:providerPid", auth, getTransferProcess);
	router.post("/request", auth, requestTransfer);
	router.post("/:providerPid/start", auth, startTransfer);
	router.post("/:providerPid/completion", auth, completeTransfer);
	router.post("/:providerPid/suspension", auth, suspendTransfer);
	router.post("/:providerPid/termination", auth, terminateTransfer);

	return router;
}
