import express from "express";
import request from "supertest";
import { createDspProvider } from "../../src/provider";
import {
	makeInMemoryStore,
	InMemoryNegotiationStore,
} from "../helpers/in-memory-store";
import {
	NegotiationState,
	ContractNegotiation,
} from "../../src/types/negotiation";

function makeApp() {
	const store = makeInMemoryStore();
	const provider = createDspProvider({ store });

	const app = express();
	app.use(express.json());
	app.use("/dsp", provider.router);
	return { app, negStore: store.negotiation };
}

// Helper to create a seeded negotiation
function seedNegotiation(
	store: InMemoryNegotiationStore,
	overrides: Partial<ContractNegotiation> = {},
): ContractNegotiation {
	const negotiation: ContractNegotiation = {
		"@type": "ContractNegotiation",
		providerPid: "urn:uuid:provider-001",
		consumerPid: "urn:uuid:consumer-001",
		state: NegotiationState.REQUESTED,
		callbackAddress: "https://consumer.example/callback",
		...overrides,
	};
	store.seed(negotiation);
	return negotiation;
}

describe("Provider — Negotiation endpoints (§8.2)", () => {
	describe("POST /dsp/negotiations/request — initiate negotiation", () => {
		it("creates a new negotiation and returns 201", async () => {
			const { app } = makeApp();

			const res = await request(app)
				.post("/dsp/negotiations/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractRequestMessage",
					consumerPid: "urn:uuid:consumer-002",
					callbackAddress: "https://consumer.example/callback",
					offer: {
						"@id": "urn:offer:1",
						target: "urn:dataset:1",
						permission: [],
					},
				});

			expect(res.status).toBe(201);
			expect(res.body["@type"]).toBe("ContractNegotiation");
			expect(res.body.state).toBe(NegotiationState.REQUESTED);
			expect(res.body.providerPid).toBeDefined();
		});
	});

	describe("GET /dsp/negotiations/:providerPid — get negotiation", () => {
		it("returns 200 with negotiation details", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore);

			const res = await request(app).get(
				"/dsp/negotiations/urn:uuid:provider-001",
			);

			expect(res.status).toBe(200);
			expect(res.body["@type"]).toBe("ContractNegotiation");
			expect(res.body.providerPid).toBe("urn:uuid:provider-001");
			expect(res.body.state).toBe(NegotiationState.REQUESTED);
		});

		it("returns 404 for unknown providerPid", async () => {
			const { app } = makeApp();

			const res = await request(app).get(
				"/dsp/negotiations/urn:uuid:unknown",
			);

			expect(res.status).toBe(404);
			expect(res.body["@type"]).toBe("ContractNegotiationError");
			expect(res.body.code).toBe("NotFound");
		});
	});

	describe("POST /dsp/negotiations/:providerPid/request — counter-offer", () => {
		it("returns 200 and updates state to REQUESTED when from OFFERED", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:provider-001/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractRequestMessage",
					consumerPid: "urn:uuid:consumer-001",
					offer: {
						"@id": "urn:offer:2",
						target: "urn:dataset:1",
						permission: [],
					},
					callbackAddress: "https://consumer.example/callback",
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.REQUESTED);
		});

		it("returns 400 if state transition is invalid", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.AGREED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:provider-001/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractRequestMessage",
					consumerPid: "urn:uuid:consumer-001",
					offer: {
						"@id": "urn:offer:2",
						target: "urn:dataset:1",
						permission: [],
					},
					callbackAddress: "https://consumer.example/callback",
				});

			expect(res.status).toBe(400);
			expect(res.body.code).toBe("InvalidStateTransition");
		});

		it("returns 404 for unknown providerPid", async () => {
			const { app } = makeApp();

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:nonexistent/request")
				.send({
					"@type": "ContractRequestMessage",
					consumerPid: "x",
					offer: {},
				});

			expect(res.status).toBe(404);
		});
	});

	describe("POST /dsp/negotiations/:providerPid/events — consumer accept", () => {
		it("transitions OFFERED → ACCEPTED on accept event", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.OFFERED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:provider-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "ACCEPTED",
					consumerPid: "urn:uuid:consumer-001",
					providerPid: "urn:uuid:provider-001",
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.ACCEPTED);
		});

		it("returns 400 for invalid event from REQUESTED state", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.REQUESTED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:provider-001/events")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationEventMessage",
					eventType: "ACCEPTED",
					consumerPid: "urn:uuid:consumer-001",
					providerPid: "urn:uuid:provider-001",
				});

			expect(res.status).toBe(400);
		});
	});

	describe("POST /dsp/negotiations/:providerPid/agreement/verification — verify", () => {
		it("transitions AGREED → VERIFIED on verification", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.AGREED });

			const res = await request(app)
				.post(
					"/dsp/negotiations/urn:uuid:provider-001/agreement/verification",
				)
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractAgreementVerificationMessage",
					consumerPid: "urn:uuid:consumer-001",
					providerPid: "urn:uuid:provider-001",
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.VERIFIED);
		});
	});

	describe("POST /dsp/negotiations/:providerPid/termination — terminate", () => {
		it("transitions REQUESTED → TERMINATED on termination", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.REQUESTED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:provider-001/termination")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationTerminationMessage",
					consumerPid: "urn:uuid:consumer-001",
					providerPid: "urn:uuid:provider-001",
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.TERMINATED);
		});

		it("returns 400 when already in a terminal state", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.FINALIZED });

			const res = await request(app)
				.post("/dsp/negotiations/urn:uuid:provider-001/termination")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractNegotiationTerminationMessage",
					consumerPid: "urn:uuid:consumer-001",
					providerPid: "urn:uuid:provider-001",
				});

			expect(res.status).toBe(400);
		});
	});
});
