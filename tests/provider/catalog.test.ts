import express from "express";
import request from "supertest";
import { createDspProvider } from "../../src/provider";
import { makeInMemoryStore } from "../helpers/in-memory-store";
import { Catalog, Dataset } from "../../src/types/catalog";

function makeTestApp() {
	const catalog: Catalog = {
		"@context": ["https://w3id.org/dspace/2025/1/context.jsonld"],
		"@type": "Catalog",
		"@id": "urn:catalog:test",
		dataset: [],
		service: [],
	};
	const dataset: Dataset = {
		"@id": "urn:dataset:1",
		"@type": "Dataset",
		title: "Test Dataset",
		hasPolicy: [],
		distribution: [],
	};

	const store = makeInMemoryStore({ catalog, datasets: [dataset] });
	const provider = createDspProvider({ store });

	const app = express();
	app.use(express.json());
	app.use(provider.wellKnownRouter);
	app.use("/dsp", provider.router);
	return app;
}

const app = makeTestApp();

describe("Provider — Catalog endpoints", () => {
	describe("POST /dsp/catalog/request", () => {
		it("returns 200 with a Catalog when no filter is provided", async () => {
			const res = await request(app)
				.post("/dsp/catalog/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "CatalogRequestMessage",
				});

			expect(res.status).toBe(200);
			expect(res.body["@type"]).toBe("Catalog");
			expect(res.body["@id"]).toBe("urn:catalog:test");
		});

		it("returns 400 when filter is provided but catalogFilter handler is absent", async () => {
			const res = await request(app)
				.post("/dsp/catalog/request")
				.send({
					"@context": [
						"https://w3id.org/dspace/2025/1/context.jsonld",
					],
					"@type": "CatalogRequestMessage",
					filter: { keyword: "test" },
				});

			expect(res.status).toBe(400);
			expect(res.body["@type"]).toBe("CatalogError");
			expect(res.body.code).toBe("FilterNotSupported");
		});
	});

	describe("GET /dsp/catalog/datasets/:id", () => {
		it("returns 200 with the matching dataset", async () => {
			const res = await request(app).get(
				"/dsp/catalog/datasets/urn:dataset:1",
			);

			expect(res.status).toBe(200);
			expect(res.body["@id"]).toBe("urn:dataset:1");
		});

		it("returns 404 for an unknown dataset ID", async () => {
			const res = await request(app).get(
				"/dsp/catalog/datasets/urn:dataset:missing",
			);

			expect(res.status).toBe(404);
			expect(res.body["@type"]).toBe("CatalogError");
			expect(res.body.code).toBe("NotFound");
		});
	});
});
