import express from "express";
import request from "supertest";
import { makeConsumerNegotiationRouter } from "../../src/consumer/routes/negotiation.callback.routes";
import {
	makeInMemoryStore,
	InMemoryNegotiationStore,
} from "../helpers/in-memory-store";
import {
	NegotiationState,
	ContractNegotiation,
} from "../../src/types/negotiation";
import { RequestHandler } from "express";

const noopAuth: RequestHandler = (_req, _res, next) => next();

function makeApp() {
	const store = makeInMemoryStore();
	const router = makeConsumerNegotiationRouter(
		{ store: store.negotiation },
		noopAuth,
	);

	const app = express();
	app.use(express.json());
	app.use("/negotiations", router);
	return { app, negStore: store.negotiation };
}

function seedNegotiation(
	store: InMemoryNegotiationStore,
	overrides: Partial<ContractNegotiation> = {},
): ContractNegotiation {
	const negotiation: ContractNegotiation = {
		"@type": "ContractNegotiation",
		providerPid: "urn:uuid:prov-001",
		consumerPid: "urn:uuid:cons-001",
		state: NegotiationState.REQUESTED,
		callbackAddress: "https://provider.example/callback",
		...overrides,
	};
	store.seed(negotiation);
	return negotiation;
}

describe("Consumer - Negotiation callback endpoints (§8.3)", () => {
	describe("GET /negotiations/:consumerPid", () => {
		it("returns 200 with negotiation details", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore);

			const res = await request(app).get(
				"/negotiations/urn:uuid:cons-001",
			);

			expect(res.status).toBe(200);
			expect(res.body["@type"]).toBe("ContractNegotiation");
			expect(res.body.consumerPid).toBe("urn:uuid:cons-001");
		});

		it("returns 404 for unknown consumerPid", async () => {
			const { app } = makeApp();

			const res = await request(app).get(
				"/negotiations/urn:uuid:unknown",
			);

			expect(res.status).toBe(404);
			expect(res.body["@type"]).toBe("ContractNegotiationError");
		});
	});

	describe("POST /negotiations/offers - provider initiates with offer", () => {
		it("creates a new consumer-side negotiation and returns 201", async () => {
			const { app } = makeApp();

			const res = await request(app)
				.post("/negotiations/offers")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractOfferMessage",
					providerPid: "urn:uuid:prov-002",
					callbackAddress: "https://provider.example/callback",
					offer: {
						"@id": "urn:offer:1",
						target: "urn:dataset:1",
						permission: [],
					},
				});

			expect(res.status).toBe(201);
			expect(res.body["@type"]).toBe("ContractNegotiation");
			expect(res.body.state).toBe(NegotiationState.OFFERED);
			expect(res.body.consumerPid).toBeDefined();
		});
	});

	describe("POST /negotiations/:consumerPid/offers - provider counter-offer", () => {
		it("transitions REQUESTED → OFFERED on counter-offer", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.REQUESTED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/offers")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractOfferMessage",
					providerPid: "urn:uuid:prov-001",
					callbackAddress: "https://provider.example/callback",
					offer: {
						"@id": "urn:offer:2",
						target: "urn:dataset:1",
						permission: [],
					},
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.OFFERED);
		});

		it("returns 400 for invalid transition", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.FINALIZED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/offers")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractOfferMessage",
					providerPid: "urn:uuid:prov-001",
					callbackAddress: "https://provider.example/callback",
					offer: {
						"@id": "urn:offer:2",
						target: "urn:dataset:1",
						permission: [],
					},
				});

			expect(res.status).toBe(400);
		});
	});

	describe("POST /negotiations/:consumerPid/agreement - receive agreement", () => {
		it("transitions ACCEPTED → AGREED on agreement receipt", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.ACCEPTED });

			const res = await request(app)
				.post("/negotiations/urn:uuid:cons-001/agreement")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "ContractAgreementMessage",
					providerPid: "urn:uuid:prov-001",
					consumerPid: "urn:uuid:cons-001",
					agreement: {
						"@id": "urn:agreement:001",
						"@type": "Agreement",
						target: "urn:dataset:1",
						assigner: "urn:provider:1",
						assignee: "urn:consumer:1",
						timestamp: new Date().toISOString(),
					},
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.AGREED);
		});
	});

	describe("POST /negotiations/:consumerPid/events - receive finalized event", () => {
		it("transitions VERIFIED → FINALIZED on finalized event", async () => {
			const { app, negStore } = makeApp();
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
			expect(res.body.state).toBe(NegotiationState.FINALIZED);
		});
	});

	describe("POST /negotiations/:consumerPid/termination - receive termination", () => {
		it("transitions OFFERED → TERMINATED", async () => {
			const { app, negStore } = makeApp();
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

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(NegotiationState.TERMINATED);
		});

		it("returns 400 when already terminated", async () => {
			const { app, negStore } = makeApp();
			seedNegotiation(negStore, { state: NegotiationState.TERMINATED });

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

			expect(res.status).toBe(400);
		});
	});
});
