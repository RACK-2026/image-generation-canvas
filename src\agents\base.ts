// Base agent class with logging, timing, and error handling

import type { AgentInput, AgentOutput } from './types';

export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly name: string;

  protected log(msg: string, data?: any) {
    console.log(`[${this.id}] ${msg}`, data ?? '');
  }

  protected warn(msg: string, data?: any) {
    console.warn(`[${this.id}] ${msg}`, data ?? '');
  }

  // Subclasses implement their logic here
  protected abstract run(input: AgentInput): Promise<any>;

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startedAt = Date.now();
    this.log(`Starting: ${this.name}`);

    try {
      // Check abort
      if (input.signal?.aborted) {
        return {
          agentId: this.id,
          status: 'skipped',
          data: null,
          duration: 0,
          error: 'Aborted',
          startedAt,
          completedAt: Date.now(),
        };
      }

      const data = await this.run(input);
      const completedAt = Date.now();
      this.log(`Completed in ${completedAt - startedAt}ms`);

      return {
        agentId: this.id,
        status: 'success',
        data,
        duration: completedAt - startedAt,
        startedAt,
        completedAt,
      };
    } catch (err: any) {
      const completedAt = Date.now();
      this.warn(`Failed: ${err.message}`);

      return {
        agentId: this.id,
        status: 'failed',
        data: null,
        duration: completedAt - startedAt,
        error: err.message,
        startedAt,
        completedAt,
      };
    }
  }
}

