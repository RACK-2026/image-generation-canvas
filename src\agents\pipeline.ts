// Pipeline orchestrator - orchestrates 9 agents in sequence with progress events and retry logic

import type {
  PipelineInput, PipelineResult, AgentOutput, AgentProgressEvent,
  PipelineProgressCallback,
} from './types';
import { BaseAgent } from './base';
import { AssetAnalyzer } from './asset-analyzer';
import { ProductExtractor } from './product-extractor';
import { LogoExtractor } from './logo-extractor';
import { CopyAnalyzer } from './copy-analyzer';
import { StyleAnalyzer } from './style-analyzer';
import { DesignPlanner } from './design-planner';
import { PromptEngineer } from './prompt-engineer';
import { ImageGenerator } from './image-generator';
import { QualityChecker } from './quality-checker';
import { persistAgentOutput } from '../assets-store/manager';

const MAX_RETRIES = 2;

// Agents that can be retried when quality check fails
const RETRY_START_AGENT = 'prompt-engineer';

export class PosterPipeline {
  private agents: BaseAgent[];
  private onProgress?: PipelineProgressCallback;

  constructor(onProgress?: PipelineProgressCallback) {
    this.onProgress = onProgress;
    this.agents = [
      new AssetAnalyzer(),
      new ProductExtractor(),
      new LogoExtractor(),
      new CopyAnalyzer(),
      new StyleAnalyzer(),
      new DesignPlanner(),
      new PromptEngineer(),
      new ImageGenerator(),
      new QualityChecker(),
    ];
  }

  async run(input: PipelineInput): Promise<PipelineResult> {
    const startTime = Date.now();
    const outputs: Record<string, AgentOutput> = {};
    let retries = 0;

    // Notify all agents as waiting
    for (const agent of this.agents) {
      this.emitProgress({ agentId: agent.id, agentName: agent.name, status: 'waiting' });
    }

    let startFromIndex = 0;

    while (startFromIndex < this.agents.length) {
      for (let i = startFromIndex; i < this.agents.length; i++) {
        const agent = this.agents[i];

        // Check abort
        if (input.signal?.aborted) {
          this.emitProgress({ agentId: agent.id, agentName: agent.name, status: 'skipped', message: '已取消' });
          break;
        }

        this.emitProgress({ agentId: agent.id, agentName: agent.name, status: 'running' });

        const output = await agent.execute({
          taskId: input.taskId,
          config: input.config,
          images: input.images,
          userInput: input.userInput,
          params: input.params,
          previousOutputs: outputs,
          signal: input.signal,
        });

        outputs[agent.id] = output;

        // Persist to asset store
        if (output.status === 'success') {
          try {
            await persistAgentOutput(input.taskId, agent.id, output);
          } catch (err) {
            console.warn(`[Pipeline] Failed to persist ${agent.id}:`, err);
          }
        }

        // Emit progress
        this.emitProgress({
          agentId: agent.id,
          agentName: agent.name,
          status: output.status === 'success' ? 'success' : 'failed',
          message: output.error,
          duration: output.duration,
        });

        // If agent failed and it's critical, stop pipeline
        if (output.status === 'failed') {
          // For non-critical agents (logo, style), we can continue with defaults
          const nonCritical = ['logo-extractor', 'style-analyzer'];
          if (!nonCritical.includes(agent.id)) {
            throw new Error(`${agent.name}失败: ${output.error}`);
          }
          this.emitProgress({
            agentId: agent.id,
            agentName: agent.name,
            status: 'skipped',
            message: `${agent.name}失败，使用默认值`,
          });
        }

        // Quality check: if failed, retry from prompt-engineer
        if (agent.id === 'quality-checker' && output.status === 'success') {
          const qcData = output.data;
          if (!qcData?.pass && retries < MAX_RETRIES) {
            retries++;
            this.emitProgress({
              agentId: 'pipeline',
              agentName: '流水线',
              status: 'running',
              message: `质量检查未通过，第${retries}次重试...`,
            });

            // Find prompt-engineer index and restart from there
            const retryIdx = this.agents.findIndex(a => a.id === RETRY_START_AGENT);
            if (retryIdx >= 0) {
              startFromIndex = retryIdx;
              // Clear outputs from prompt-engineer onwards
              for (let j = retryIdx; j < this.agents.length; j++) {
                delete outputs[this.agents[j].id];
              }
              break; // Break inner for loop, while loop will re-enter
            }
          }
        }

        // If we reached the end normally
        if (i === this.agents.length - 1) {
          startFromIndex = this.agents.length; // Exit while loop
        }
      }
    }

    // Extract final images
    const imageGenOutput = outputs['image-generator'];
    const finalImages = imageGenOutput?.data?.images || [];

    return {
      outputs,
      finalImages,
      totalDuration: Date.now() - startTime,
      retries,
    };
  }

  private emitProgress(event: AgentProgressEvent) {
    this.onProgress?.(event);
  }
}

