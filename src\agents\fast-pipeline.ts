// Optimized Pipeline - 5 agents with parallel execution and targeted retry
// Old: 9 agents, 4-6 min | New: 5 agents, 90-150s

import type {
  PipelineInput, PipelineResult, AgentOutput, AgentProgressEvent,
  PipelineProgressCallback,
} from './types';
import { BaseAgent } from './base';
import { VisionAgent } from './vision-agent';
import { ExtractionAgent } from './extraction-agent';
import { PlanningAgent } from './planning-agent';
import { RenderAgent } from './render-agent';
import { QCAgent } from './qc-agent';
import { persistAgentOutput } from '../assets-store/manager';
import { hashImage, hashPlanningKey } from '../vault/image-hash';
import {
  getCachedVision, getCachedExtraction, getCachedPlanning,
  saveVisionCache, saveExtractionCache, savePlanningCache,
} from '../vault/cache';
import { isVaultReady } from '../vault/vault-writer';
import { saveImageRecord, saveTaskVaultRecord } from '../vault/vault-manager';
import type { VisionOutput } from './vision-agent';
import type { ExtractionOutput } from './extraction-agent';
import type { PlanningOutput } from './planning-agent';
import type { QCOutput } from './qc-agent';

const MAX_RETRIES = 2;

export class FastPipeline {
  private onProgress?: PipelineProgressCallback;

  constructor(onProgress?: PipelineProgressCallback) {
    this.onProgress = onProgress;
  }

  async run(input: PipelineInput, resumeOutputs?: Record<string, AgentOutput>): Promise<PipelineResult> {
    const startTime = Date.now();
    const outputs: Record<string, AgentOutput> = { ...resumeOutputs };
    let retries = 0;

    const agents = {
      vision: new VisionAgent(),
      extraction: new ExtractionAgent(),
      planning: new PlanningAgent(),
      render: new RenderAgent(),
      qc: new QCAgent(),
    };

    // Notify all waiting (or mark completed ones as success)
    for (const [id, agent] of Object.entries(agents)) {
      if (outputs[id]?.status === 'success') {
        this.emitProgress({ agentId: id, agentName: agent.name, status: 'success', duration: outputs[id].duration, message: '已恢复' });
      } else {
        this.emitProgress({ agentId: id, agentName: agent.name, status: 'waiting' });
      }
    }

    try {
      // Compute image hashes for cache lookup
      const imageHashes: string[] = [];
      for (const img of input.images) {
        const hash = await hashImage(img.base64);
        imageHashes.push(hash);
      }
      this.emitProgress({ agentId: 'pipeline', agentName: '流水线', status: 'running', message: `图片哈希: ${imageHashes.length}张` });

      // Step 1: Vision analysis (1 multimodal call, ~15s)
      if (!outputs['vision']?.data) {
        // Check cache for all images
        let allVisionCached = true;
        const cachedVisionResults: VisionOutput[] = [];
        for (const hash of imageHashes) {
          const cached = await getCachedVision(hash);
          if (cached) {
            cachedVisionResults.push(cached);
          } else {
            allVisionCached = false;
            break;
          }
        }

        if (allVisionCached && cachedVisionResults.length === imageHashes.length) {
          // All images have cached vision results - use first one (primary image)
          outputs['vision'] = {
            agentId: 'vision', status: 'success', data: cachedVisionResults[0],
            duration: 0, startedAt: Date.now(), completedAt: Date.now(),
          };
          this.emitProgress({ agentId: 'vision', agentName: '视觉分析', status: 'success', duration: 0, message: '缓存命中' });
        } else {
          this.emitProgress({ agentId: 'vision', agentName: '视觉分析', status: 'running' });
          const visionOutput = await this.executeAgent(agents.vision, input, outputs);
          outputs['vision'] = visionOutput;
          await this.persist(input.taskId, 'vision', visionOutput);

          // Save to cache and vault
          if (visionOutput.status === 'success' && visionOutput.data && imageHashes[0]) {
            await saveVisionCache(imageHashes[0], visionOutput.data as VisionOutput);
            // Vault write will happen after extraction
          }

          this.emitProgress({
            agentId: 'vision', agentName: '视觉分析',
            status: visionOutput.status === 'success' ? 'success' : 'failed',
            duration: visionOutput.duration,
          });
          if (visionOutput.status === 'failed') {
            throw new Error(`视觉分析失败: ${visionOutput.error}`);
          }
        }
      } else {
        this.emitProgress({ agentId: 'vision', agentName: '视觉分析', status: 'success', duration: outputs['vision'].duration, message: '跳过(已完成)' });
      }

      // Step 2: Extraction (local processing, ~1-3s)
      if (!outputs['extraction']?.data) {
        // Check cache for primary image
        const cachedExtraction = imageHashes[0] ? await getCachedExtraction(imageHashes[0]) : null;

        if (cachedExtraction) {
          outputs['extraction'] = {
            agentId: 'extraction', status: 'success', data: cachedExtraction,
            duration: 0, startedAt: Date.now(), completedAt: Date.now(),
          };
          this.emitProgress({ agentId: 'extraction', agentName: '资产提取', status: 'success', duration: 0, message: '缓存命中' });
        } else {
          this.emitProgress({ agentId: 'extraction', agentName: '资产提取', status: 'running' });
          const extractionOutput = await this.executeAgent(agents.extraction, input, outputs);
          outputs['extraction'] = extractionOutput;
          await this.persist(input.taskId, 'extraction', extractionOutput);

          // Save to cache and vault
          if (extractionOutput.status === 'success' && extractionOutput.data && imageHashes[0]) {
            await saveExtractionCache(imageHashes[0], extractionOutput.data as ExtractionOutput);

            // Write to vault if ready
            if (isVaultReady() && outputs['vision']?.data) {
              await saveImageRecord(
                imageHashes[0],
                outputs['vision'].data as VisionOutput,
                extractionOutput.data as ExtractionOutput,
                input.taskId,
              );
            }
          }

          this.emitProgress({
            agentId: 'extraction', agentName: '资产提取',
            status: extractionOutput.status === 'success' ? 'success' : 'failed',
            duration: extractionOutput.duration,
          });
          if (extractionOutput.status === 'failed') {
            this.emitProgress({ agentId: 'extraction', agentName: '资产提取', status: 'skipped', message: '使用原图' });
          }
        }
      } else {
        this.emitProgress({ agentId: 'extraction', agentName: '资产提取', status: 'success', duration: outputs['extraction'].duration, message: '跳过(已完成)' });
      }

      // Steps 3-5: Planning -> Render -> QC (with targeted retry)
      let retryFromPlanning = false;

      do {
        retryFromPlanning = false;

        // Step 3: Planning (1 text call, ~15-25s)
        // Check planning cache (composite key: imageHash + userInput)
        const planningCacheKey = imageHashes[0] ? await hashPlanningKey(imageHashes[0], input.userInput) : null;
        const cachedPlanning = planningCacheKey ? await getCachedPlanning(planningCacheKey) : null;

        if (cachedPlanning) {
          outputs['planning'] = {
            agentId: 'planning', status: 'success', data: cachedPlanning,
            duration: 0, startedAt: Date.now(), completedAt: Date.now(),
          };
          this.emitProgress({ agentId: 'planning', agentName: '方案规划', status: 'success', duration: 0, message: '缓存命中' });
        } else {
          this.emitProgress({ agentId: 'planning', agentName: '方案规划', status: 'running' });
          const planningOutput = await this.executeAgent(agents.planning, input, outputs);
          outputs['planning'] = planningOutput;
          await this.persist(input.taskId, 'planning', planningOutput);

          // Save to cache
          if (planningOutput.status === 'success' && planningOutput.data && planningCacheKey && imageHashes[0]) {
            await savePlanningCache(planningCacheKey, imageHashes[0], planningOutput.data as PlanningOutput);
          }

          this.emitProgress({
            agentId: 'planning', agentName: '方案规划',
            status: planningOutput.status === 'success' ? 'success' : 'failed',
            duration: planningOutput.duration,
          });

          if (planningOutput.status === 'failed') {
            throw new Error(`方案规划失败: ${planningOutput.error}`);
          }
        }

        // Step 4: Render (1 image call, ~60-120s)
        this.emitProgress({ agentId: 'render', agentName: '图片生成', status: 'running' });
        const renderOutput = await this.executeAgent(agents.render, input, outputs);
        outputs['render'] = renderOutput;
        await this.persist(input.taskId, 'render', renderOutput);
        this.emitProgress({
          agentId: 'render', agentName: '图片生成',
          status: renderOutput.status === 'success' ? 'success' : 'failed',
          duration: renderOutput.duration,
        });

        if (renderOutput.status === 'failed') {
          throw new Error(`图片生成失败: ${renderOutput.error}`);
        }

        // Step 5: QC (1 multimodal call, ~10-20s)
        this.emitProgress({ agentId: 'qc', agentName: '质量检查', status: 'running' });
        const qcOutput = await this.executeAgent(agents.qc, input, outputs);
        outputs['qc'] = qcOutput;
        await this.persist(input.taskId, 'qc', qcOutput);
        this.emitProgress({
          agentId: 'qc', agentName: '质量检查',
          status: qcOutput.status === 'success' ? 'success' : 'failed',
          duration: qcOutput.duration,
        });

        // Targeted retry: only re-run planning -> render -> qc
        if (qcOutput.status === 'success' && !qcOutput.data?.pass && retries < MAX_RETRIES) {
          retries++;
          this.emitProgress({
            agentId: 'pipeline', agentName: '流水线',
            status: 'running', message: `质量未通过，第${retries}次重试方案...`,
          });

          // Clear planning/render/qc outputs for retry
          delete outputs['planning'];
          delete outputs['render'];
          delete outputs['qc'];
          retryFromPlanning = true;
        }
      } while (retryFromPlanning);

    } catch (err: any) {
      this.emitProgress({ agentId: 'pipeline', agentName: '流水线', status: 'failed', message: err.message });
      throw err;
    }

    // Extract final images
    const renderOutput = outputs['render'];
    const finalImages = renderOutput?.data?.images || [];

    // Write task record to vault
    if (isVaultReady() && outputs['planning']?.data && outputs['qc']?.data) {
      try {
        await saveTaskVaultRecord(
          input.taskId,
          imageHashes,
          input.userInput,
          outputs['planning'].data as PlanningOutput,
          finalImages,
          outputs['qc'].data as QCOutput,
        );
      } catch (err) {
        console.warn('[Pipeline] Failed to write vault task record:', err);
      }
    }

    const result: PipelineResult = {
      outputs,
      finalImages,
      totalDuration: Date.now() - startTime,
      retries,
    };

    this.emitProgress({
      agentId: 'pipeline', agentName: '流水线',
      status: 'success', message: `完成 (${result.totalDuration}ms)`,
      duration: result.totalDuration,
    });

    return result;
  }

  private async executeAgent(agent: BaseAgent, input: PipelineInput, outputs: Record<string, AgentOutput>): Promise<AgentOutput> {
    if (input.signal?.aborted) {
      return { agentId: agent.id, status: 'skipped', data: null, duration: 0, error: 'Aborted', startedAt: Date.now(), completedAt: Date.now() };
    }

    return agent.execute({
      taskId: input.taskId,
      config: input.config,
      images: input.images,
      userInput: input.userInput,
      params: input.params,
      previousOutputs: outputs,
      signal: input.signal,
    });
  }

  private async persist(taskId: string, agentId: string, output: AgentOutput) {
    if (output.status === 'success') {
      try {
        await persistAgentOutput(taskId, agentId, output);
      } catch (err) {
        console.warn(`[Pipeline] Failed to persist ${agentId}:`, err);
      }
    }
  }

  private emitProgress(event: AgentProgressEvent) {
    this.onProgress?.(event);
  }
}

