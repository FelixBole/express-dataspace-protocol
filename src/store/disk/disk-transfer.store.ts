import { promises as fs } from "fs";
import * as path from "path";
import { TransferStore } from "../interfaces";
import { TransferProcess } from "../../types/transfer";

export class DiskTransferStore implements TransferStore {
	private readonly filePath: string;

	constructor(dir: string) {
		this.filePath = path.join(dir, "transfers.json");
	}

	private async readAll(): Promise<TransferProcess[]> {
		try {
			const raw = await fs.readFile(this.filePath, "utf-8");
			return JSON.parse(raw) as TransferProcess[];
		} catch {
			return [];
		}
	}

	private async writeAll(transfers: TransferProcess[]): Promise<void> {
		await fs.writeFile(
			this.filePath,
			JSON.stringify(transfers, null, 2),
			"utf-8",
		);
	}

	async create(transfer: TransferProcess): Promise<TransferProcess> {
		const all = await this.readAll();
		all.push(transfer);
		await this.writeAll(all);
		return transfer;
	}

	async findByProviderPid(
		providerPid: string,
	): Promise<TransferProcess | null> {
		const all = await this.readAll();
		return all.find((t) => t.providerPid === providerPid) ?? null;
	}

	async findByConsumerPid(
		consumerPid: string,
	): Promise<TransferProcess | null> {
		const all = await this.readAll();
		return all.find((t) => t.consumerPid === consumerPid) ?? null;
	}

	async update(
		providerPid: string,
		patch: Partial<TransferProcess>,
	): Promise<TransferProcess> {
		const all = await this.readAll();
		const idx = all.findIndex((t) => t.providerPid === providerPid);
		if (idx === -1) {
			throw new Error(`Transfer process not found: ${providerPid}`);
		}
		all[idx] = { ...all[idx], ...patch };
		await this.writeAll(all);
		return all[idx];
	}
}
