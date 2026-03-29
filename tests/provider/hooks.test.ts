/**
 * Tests for the provider-side hook system.
 *
 * Covers inbound Consumer→Provider messages on both the negotiation and
 * transfer endpoints. Each test verifies:
 *  1. The HTTP response is correct.
 *  2. The hook is called exactly once.
 *  3. The entity passed to the hook reflects the new DSP state.
 *
 * Provider-initiated outbound helpers (sendAgreement, providerStartTransfer,
 * etc.) are NOT tested here - they involve outbound fetch calls. Those helpers
 * are exercised elsewhere. Hooks for the inbound handlers are the focus.
 */

import express from "express";
import request from "supertest";
import { createDspProvider } from "../../src/provider";
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
	ProviderNegotiationHooks,
	ProviderTransferHooks,
} from "../../src/types/hooks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(
	negHooks?: ProviderNegotiationHooks,
	xferHooks?: ProviderTransferHooks,
) {
	const store = makeInMemoryStore();
	const provider = createDspProvider({
		store,
		hooks: {
			negotiation: negHooks,
			transfer: xferHooks,
		},
	});
	const app = express();
	app.use(express.json());
	app.use("/dsp", provider.router);
	return { app, negStore: store.negotiation, xferStore: store.transfer };
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
		callbackAddress: "https://consumer.example/callback",
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
		callbackAddress: "https://consumer.example/callback",
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

describe("Provider - negotiation hooks", () => {
	describe("onNegotiationRequested - POST /dsp/negotiations/request", () => {
		it("is called with state=REQUESTED and the Consumer offer terms", async () => {
			const hook = jest.fn();
			const { app } = makeApp({ onNegotiationRequested: hook });

			const res = await request(app)
				.post("/dsp/negotiations/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractRequestMessage",
					consumerPid: "urn:uuid:cons-002",
					callbackAddress: "https://consumer.example/callback",
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
			expect(received.state).toBe(NegotiationState.REQUESTED);
			expect(received.offer).toMatchObject({
				"@id": "urn:offer:1",
				target: "urn:dataset:42",
			});
		});
	});

	describe("onNegotiationRequested - POST /dsp/negotiations/:providerPid/request (counter-request)", () => {
		it("is called with state=REQUESTED and updated offer terms", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeApp({ onNegotiationRequested: hook });
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:prov-001/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractRequestMessage",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
					callbackAddress: "https://consumer.example/callback",
					offer: {
						"@id": "urn:offer:counter",
						target: "urn:dataset:42",
						permission: [],
					},
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			const received: ContractNegotiation = hook.mock.calls[0][0];
			expect(received.state).toBe(NegotiationState.REQUESTED);
			expect(received.offer?.["@id"]).toBe("urn:offer:counter");
		});
	});

	describe("onNegotiationAccepted - POST /dsp/negotiations/:providerPid/events (ACCEPTED)", () => {
		it("is called with state=ACCEPTED", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeApp({ onNegotiationAccepted: hook });
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:prov-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "ACCEPTED",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(NegotiationState.ACCEPTED);
		});
	});

	describe("onAgreementVerified - POST /dsp/negotiations/:providerPid/agreement/verification", () => {
		it("is called with state=VERIFIED", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeApp({ onAgreementVerified: hook });
			seedNegotiation(negStore, { state: NegotiationState.AGREED });

			const res = await request(app)
				.post(
					"/dsp/negotiations/urn:uuid:prov-001/agreement/verification",
				)
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractAgreementVerificationMessage",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(NegotiationState.VERIFIED);
		});
	});

	describe("onNegotiationTerminated - POST /dsp/negotiations/:providerPid/termination", () => {
		it("is called with state=TERMINATED", async () => {
			const hook = jest.fn();
			const { app, negStore } = makeApp({
				onNegotiationTerminated: hook,
			});
			seedNegotiation(negStore, { state: NegotiationState.REQUESTED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:prov-001/termination")
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
				.mockRejectedValue(new Error("policy engine is down"));
			const { app, negStore } = makeApp({
				onNegotiationAccepted: throwingHook,
			});
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:prov-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "ACCEPTED",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
				});

			await flush();

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.ACCEPTED);
			expect(throwingHook).toHaveBeenCalledTimes(1);
		});

		it("no-op when no hook is registered", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:prov-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "ACCEPTED",
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

describe("Provider - transfer hooks", () => {
	describe("onTransferRequested - POST /dsp/transfers/request", () => {
		it("is called with state=REQUESTED", async () => {
			const hook = jest.fn();
			const { app } = makeApp(undefined, { onTransferRequested: hook });

			const res = await request(app)
				.post("/dsp/transfers/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferRequestMessage",
					consumerPid: "urn:uuid:tp-cons-002",
					agreementId: "urn:agreement:002",
					format: "HTTP_PULL",
					callbackAddress: "https://consumer.example/callback",
				});

			await flush();

			expect(res.status).toBe(201);
			expect(hook).toHaveBeenCalledTimes(1);
			const received: TransferProcess = hook.mock.calls[0][0];
			expect(received.state).toBe(TransferState.REQUESTED);
			expect(received.agreementId).toBe("urn:agreement:002");
		});
	});

	describe("onTransferRestartedByConsumer - POST /dsp/transfers/:providerPid/start", () => {
		it("is called with state=STARTED when Consumer restarts after suspension", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeApp(undefined, {
				onTransferRestartedByConsumer: hook,
			});
			seedTransfer(xferStore, { state: TransferState.SUSPENDED });

			const res = await request(app)
				.post("/dsp/transfers/urn:uuid:tp-prov-001/start")
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
			expect(hook).toHaveBeenCalledTimes(1);
			expect(hook.mock.calls[0][0].state).toBe(TransferState.STARTED);
		});
	});

	describe("onTransferCompletedByConsumer - POST /dsp/transfers/:providerPid/completion", () => {
		it("is called with state=COMPLETED", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeApp(undefined, {
				onTransferCompletedByConsumer: hook,
			});
			seedTransfer(xferStore, { state: TransferState.STARTED });

			const res = await request(app)
				.post("/dsp/transfers/urn:uuid:tp-prov-001/completion")
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

	describe("onTransferSuspendedByConsumer - POST /dsp/transfers/:providerPid/suspension", () => {
		it("is called with state=SUSPENDED", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeApp(undefined, {
				onTransferSuspendedByConsumer: hook,
			});
			seedTransfer(xferStore, { state: TransferState.STARTED });

			const res = await request(app)
				.post("/dsp/transfers/urn:uuid:tp-prov-001/suspension")
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

	describe("onTransferTerminatedByConsumer - POST /dsp/transfers/:providerPid/termination", () => {
		it("is called with state=TERMINATED", async () => {
			const hook = jest.fn();
			const { app, xferStore } = makeApp(undefined, {
				onTransferTerminatedByConsumer: hook,
			});
			seedTransfer(xferStore, { state: TransferState.STARTED });

			const res = await request(app)
				.post("/dsp/transfers/urn:uuid:tp-prov-001/termination")
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
		it("a throwing hook does not affect the HTTP 201 response", async () => {
			const throwingHook = jest
				.fn()
				.mockRejectedValue(new Error("data service unavailable"));
			const { app } = makeApp(undefined, {
				onTransferRequested: throwingHook,
			});

			const res = await request(app)
				.post("/dsp/transfers/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferRequestMessage",
					consumerPid: "urn:uuid:tp-cons-003",
					agreementId: "urn:agreement:003",
					format: "HTTP_PULL",
					callbackAddress: "https://consumer.example/callback",
				});

			await flush();

			expect(res.status).toBe(201);
			expect(res.body.state).toBe(TransferState.REQUESTED);
			expect(throwingHook).toHaveBeenCalledTimes(1);
		});
	});
});
