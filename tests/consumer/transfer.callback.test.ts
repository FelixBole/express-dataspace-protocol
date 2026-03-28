import express, { RequestHandler } from "express";
import request from "supertest";
import { makeConsumerTransferRouter } from "../../src/consumer/routes/transfer.callback.routes";
import {
	makeInMemoryStore,
	InMemoryTransferStore,
} from "../helpers/in-memory-store";
import { TransferState, TransferProcess } from "../../src/types/transfer";

const noopAuth: RequestHandler = (_req, _res, next) => next();

function makeApp() {
	const store = makeInMemoryStore();
	const router = makeConsumerTransferRouter(
		{ store: store.transfer },
		noopAuth,
	);

	const app = express();
	app.use(express.json());
	app.use("/transfers", router);
	return { app, xferStore: store.transfer };
}

function seedTransfer(
	store: InMemoryTransferStore,
	overrides: Partial<TransferProcess> = {},
): TransferProcess {
	const transfer: TransferProcess = {
		"@type": "TransferProcess",
		providerPid: "urn:uuid:tp-prov-001",
		consumerPid: "urn:uuid:tp-cons-001",
		state: TransferState.REQUESTED,
		agreementId: "urn:agreement:001",
		format: "HTTP_PULL",
		callbackAddress: "https://provider.example/callback",
		...overrides,
	};
	store.seed(transfer);
	return transfer;
}

describe("Consumer — Transfer callback endpoints (§10.3)", () => {
	describe("POST /transfers/:consumerPid/start — receive start", () => {
		it("transitions REQUESTED → STARTED on start message", async () => {
			const { app, xferStore } = makeApp();
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

			expect(res.status).toBe(200);
			expect(res.body["@type"]).toBe("TransferProcess");
			expect(res.body.state).toBe(TransferState.STARTED);
		});

		it("transitions SUSPENDED → STARTED on restart", async () => {
			const { app, xferStore } = makeApp();
			seedTransfer(xferStore, { state: TransferState.SUSPENDED });

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

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(TransferState.STARTED);
		});

		it("returns 404 for unknown consumerPid", async () => {
			const { app } = makeApp();

			const res = await request(app)
				.post("/transfers/urn:uuid:unknown/start")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "TransferStartMessage",
					providerPid: "urn:uuid:tp-prov-001",
					consumerPid: "urn:uuid:unknown",
				});

			expect(res.status).toBe(404);
		});
	});

	describe("POST /transfers/:consumerPid/completion — receive completion", () => {
		it("transitions STARTED → COMPLETED", async () => {
			const { app, xferStore } = makeApp();
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

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(TransferState.COMPLETED);
		});

		it("returns 400 for invalid transition from REQUESTED", async () => {
			const { app, xferStore } = makeApp();
			seedTransfer(xferStore, { state: TransferState.REQUESTED });

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

			expect(res.status).toBe(400);
		});
	});

	describe("POST /transfers/:consumerPid/suspension — receive suspension", () => {
		it("transitions STARTED → SUSPENDED", async () => {
			const { app, xferStore } = makeApp();
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
					code: "BACKPRESSURE",
					reason: ["Consumer is overloaded"],
				});

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(TransferState.SUSPENDED);
		});
	});

	describe("POST /transfers/:consumerPid/termination — receive termination", () => {
		it("transitions STARTED → TERMINATED", async () => {
			const { app, xferStore } = makeApp();
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

			expect(res.status).toBe(200);
			expect(res.body.state).toBe(TransferState.TERMINATED);
		});

		it("returns 400 when already in a terminal state", async () => {
			const { app, xferStore } = makeApp();
			seedTransfer(xferStore, { state: TransferState.COMPLETED });

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

			expect(res.status).toBe(400);
		});
	});
});
