import { promises as fs } from 'fs';
import * as path from 'path';
import { NegotiationStore } from '../interfaces';
import { ContractNegotiation } from '../../types/negotiation';

export class DiskNegotiationStore implements NegotiationStore {
  private readonly filePath: string;

  constructor(dir: string) {
    this.filePath = path.join(dir, 'negotiations.json');
  }

  private async readAll(): Promise<ContractNegotiation[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as ContractNegotiation[];
    } catch {
      return [];
    }
  }

  private async writeAll(negotiations: ContractNegotiation[]): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(negotiations, null, 2), 'utf-8');
  }

  async create(negotiation: ContractNegotiation): Promise<ContractNegotiation> {
    const all = await this.readAll();
    all.push(negotiation);
    await this.writeAll(all);
    return negotiation;
  }

  async findByProviderPid(providerPid: string): Promise<ContractNegotiation | null> {
    const all = await this.readAll();
    return all.find((n) => n.providerPid === providerPid) ?? null;
  }

  async findByConsumerPid(consumerPid: string): Promise<ContractNegotiation | null> {
    const all = await this.readAll();
    return all.find((n) => n.consumerPid === consumerPid) ?? null;
  }

  async update(
    providerPid: string,
    patch: Partial<ContractNegotiation>
  ): Promise<ContractNegotiation> {
    const all = await this.readAll();
    const idx = all.findIndex((n) => n.providerPid === providerPid);
    if (idx === -1) {
      throw new Error(`Negotiation not found: ${providerPid}`);
    }
    all[idx] = { ...all[idx], ...patch };
    await this.writeAll(all);
    return all[idx];
  }
}
