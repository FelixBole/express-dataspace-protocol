/**
 * Tests for the consumer-side hook system.
 *
 * Each test verifies three things:
 *  1. The HTTP response is correct (the hook doesn't interfere).
 *  2. The hook is called exactly once with the updated entity.
 *  3. The entity passed to the hook already reflects the new DSP state.
 *
 * A separate section verifies resilience: a throwing hook must not change
 * the HTTP response the Provider received.
 */

import express, { RequestHandler } from "express";
import request from "supertest";
import { makeConsumerNegotiationRouter } from "../../src/consumer/routes/negotiation.callback.routes";
import { makeConsumerTransferRouter } from "../../src/consumer/routes/transfer.callback.routes";
import {
	makeInMemoryStore,
	InMemoryNegotiationStore,
	InMemoryTransferStore,
} from "../helpers/in-memory-store";
import {
	NegotiationState,
	ContractNegotiation,
} from "../../src/types/negotiation";
import { TransferState, TransferProcess } from "../../src/types/transfer";
import {
	ConsumerNegotiationHooks,
	ConsumerTransferHooks,
} from "../../src/types/hooks";

const noopAuth: RequestHandler = (_req, _res, next) => next();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNegotiationApp(hooks?: ConsumerNegotiationHooks) {
	const store = makeInMemoryStore();
	const router = makeConsumerNegotiationRouter(
		{ store: store.negotiation, hooks },
		noopAuth,
	);
	const app = express();
	app.use(express.json());
	app.use("/negotiations", router);
	return { app, negStore: store.negotiation };
}

function makeTransferApp(hooks?: ConsumerTransferHooks) {
	const store = makeInMemoryStore();
	const router = makeConsumerTransferRouter(
		{ store: store.transfer, hooks },
		noopAuth,
	);
	const app = express();
	app.use(express.json());
	app.use("/transfers", router);
	return { app, xferStore: store.transfer };
}

function seedNegotiation(
	store: InMemoryNegotiationStore,
	overrides: Partial<ContractNegotiation> = {},
): ContractNegotiation {
	const n: ContractNegotiation = {
		"@type": "ContractNegotiation",
		providerPid: "urn:uuid:prov-001",
		consumerPid: "urn:uuid:cons-001",
		state: NegotiationState.REQUESTED,
		callbackAddress: "https://provider.example/dsp",
		...overrides,
	};
	store.seed(n);
	return n;
}

function seedTransfer(
	store: InMemoryTransferStore,
	overrides: Partial<TransferProcess> = {},
): TransferProcess {
	const t: TransferProcess = {
		"@type": "TransferProcess",
		providerPid: "urn:uuid:tp-prov-001",
		consumerPid: "urn:uuid:tp-cons-001",
		state: TransferState.REQUESTED,
		agreementId: "urn:agreement:001",
		format: "HTTP_PULL",
		callbackAddress: "https://provider.example/dsp",
		...overrides,
	};
	store.seed(t);
	return t;
}

/** Flush the microtask queue so fire-and-forget hooks have a chance to run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Negotiation hooks
// ---------------------------------------------------------------------------

describe("Consumer - negotiation hooks", () => {
	describe("onOfferReceived - POST /negotiations/offers (provider initiates)", () => {
		it("is called with state=OFFERED and the offer terms", async () => {
			const hook = jest.fn();
			const { app } = makeNegotiationApp({ onOfferReceived: hook });

			const res = await request(app)
				.post("/negotiations/offers")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractOfferMessage",
					providerPid: "urn:uuid:prov-002",
					callbackAddress: "https://provider.example/dsp",
					offer: {
						"@id": "urn:offer:1",
						target: "urn:dataset:42",
						permission: [{ action: "use" }],
					},
				});

			await flush();

			expect(res.status).toBe(201);
			expect(hook).toHaveBeenCalledTimes(1);
			const received: ContractNegotiation = hook.mock.calls[0][0];
			expect(received.state).toBe(NegotiationState.OFFERED);
			expect(received.offer).toMatchObject({
				"@id": "urn:offer:1",
				target: "urn:dataset:42",
			});
		});
	});

	describe("onOfferReceived - POST /negotiations/:consumerPid/offers (counter-offer)", () => {
		it("is called with state=OFFERED and updated offer terms", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeNegotiationApp({
				onOfferReceived: hook,
			});
			seedNegotiation(negStore, { state: NegotiationState.REQUESTED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/offers")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractOfferMessage",
					providerPid: "urn:uuid:prov-001",
					callbackAddress: "https://provider.example/dsp",
					offer: {
						"@id": "urn:offer:revised",
						target: "urn:dataset:42",
						permission: [],
					},
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			const received: ContractNegotiation = hook.mock.calls[0][0];
			expect(received.state).toBe(NegotiationState.OFFERED);
			expect(received.offer?.["@id"]).toBe("urn:offer:revised");
		});
	});

	describe("onAgreementReceived - POST /negotiations/:consumerPid/agreement", () => {
		it("is called with state=AGREED and the agreement attached", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeNegotiationApp({
				onAgreementReceived: hook,
			});
			seedNegotiation(negStore, { state: NegotiationState.ACCEPTED });

			const agreement = {
				"@id": "urn:agreement:001",
				"@type": "Agreement" as const,
				target: "urn:dataset:42",
				assigner: "urn:provider:1",
				assignee: "urn:consumer:1",
			};

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/agreement")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractAgreementMessage",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
					agreement,
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			const received: ContractNegotiation = hook.mock.calls[0][0];
			expect(received.state).toBe(NegotiationState.AGREED);
			expect(received.agreement?.["@id"]).toBe("urn:agreement:001");
		});
	});

	describe("onNegotiationFinalized - POST /negotiations/:consumerPid/events", () => {
		it("is called with state=FINALIZED", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeNegotiationApp({
				onNegotiationFinalized: hook,
			});
			seedNegotiation(negStore, { state: NegotiationState.VERIFIED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "FINALIZED",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(
				NegotiationState.FINALIZED,
			);
		});
	});

	describe("onNegotiationTerminated - POST /negotiations/:consumerPid/termination", () => {
		it("is called with state=TERMINATED", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeNegotiationApp({
				onNegotiationTerminated: hook,
			});
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/termination")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationTerminationMessage",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(
				NegotiationState.TERMINATED,
			);
		});
	});

	describe("hook resilience", () => {
		it("a throwing hook does not affect the HTTP response", async () => {
			const throwingHook = jest
				.fn()
				.mockRejectedValue(new Error("business logic exploded"));
			const { app, negStore } = makeNegotiationApp({
				onNegotiationFinalized: throwingHook,
			});
			seedNegotiation(negStore, { state: NegotiationState.VERIFIED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "FINALIZED",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			await flush();

			// HTTP response must still be 200 despite hook throwing
			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.FINALIZED);
			expect(throwingHook).toHaveBeenCalledTimes(1);
		});

		it("no-op when no hook is registered", async () => {
			// No hooks at all - must not crash
			const { app, negStore } = makeNegotiationApp();
			seedNegotiation(negStore, { state: NegotiationState.VERIFIED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "FINALIZED",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			expect(res.status).toBe(200);
		});
	});
});

// ---------------------------------------------------------------------------
// Transfer hooks
// ---------------------------------------------------------------------------

describe("Consumer - transfer hooks", () => {
	describe("onTransferStarted - POST /transfers/:consumerPid/start", () => {
		it("is called with state=STARTED and the dataAddress", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeTransferApp({
				onTransferStarted: hook,
			});
			seedTransfer(xferStore, { state: TransferState.REQUESTED });

			const dataAddress = {
				endpointType: "https://w3id.org/idsa/v4.1/HTTP",
				endpoint: "https://provider.example/data/42",
			};

			const res = await request(app)
				.post("/transfers/urn:uuid:tp-cons-001/start")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferStartMessage",
					providerPid: "urn:uuid:tp-prov-001",
					consumerPid: "urn:uuid:tp-cons-001",
					dataAddress,
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			const received: TransferProcess = hook.mock.calls[0][0];
			expect(received.state).toBe(TransferState.STARTED);
			expect(received.dataAddress).toMatchObject({
				endpoint: "https://provider.example/data/42",
			});
		});
	});

	describe("onTransferCompleted - POST /transfers/:consumerPid/completion", () => {
		it("is called with state=COMPLETED", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeTransferApp({
				onTransferCompleted: hook,
			});
			seedTransfer(xferStore, { state: TransferState.STARTED });

			const res = await request(app)
				.post("/transfers/urn:uuid:tp-cons-001/completion")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferCompletionMessage",
					providerPid: "urn:uuid:tp-prov-001",
					consumerPid: "urn:uuid:tp-cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(TransferState.COMPLETED);
		});
	});

	describe("onTransferSuspended - POST /transfers/:consumerPid/suspension", () => {
		it("is called with state=SUSPENDED", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeTransferApp({
				onTransferSuspended: hook,
			});
			seedTransfer(xferStore, { state: TransferState.STARTED });

			const res = await request(app)
				.post("/transfers/urn:uuid:tp-cons-001/suspension")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferSuspensionMessage",
					providerPid: "urn:uuid:tp-prov-001",
					consumerPid: "urn:uuid:tp-cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(TransferState.SUSPENDED);
		});
	});

	describe("onTransferTerminated - POST /transfers/:consumerPid/termination", () => {
		it("is called with state=TERMINATED", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeTransferApp({
				onTransferTerminated: hook,
			});
			seedTransfer(xferStore, { state: TransferState.STARTED });

			const res = await request(app)
				.post("/transfers/urn:uuid:tp-cons-001/termination")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferTerminationMessage",
					providerPid: "urn:uuid:tp-prov-001",
					consumerPid: "urn:uuid:tp-cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(TransferState.TERMINATED);
		});
	});

	describe("hook resilience", () => {
		it("a throwing hook does not affect the HTTP response", async () => {
			const throwingHook = jest
				.fn()
				.mockRejectedValue(new Error("pipeline failed"));
			const { app, xferStore } = makeTransferApp({
				onTransferStarted: throwingHook,
			});
			seedTransfer(xferStore, { state: TransferState.REQUESTED });

			const res = await request(app)
				.post("/transfers/urn:uuid:tp-cons-001/start")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferStartMessage",
					providerPid: "urn:uuid:tp-prov-001",
					consumerPid: "urn:uuid:tp-cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(TransferState.STARTED);
			expect(throwingHook).toHaveBeenCalledTimes(1);
		});
	});
});
