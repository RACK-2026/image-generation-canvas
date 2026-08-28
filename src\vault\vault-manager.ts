// Vault Manager - Orchestrates writing Obsidian-formatted knowledge graph files
// Converts pipeline outputs into markdown with YAML frontmatter and wiki links

import { writeVaultFile, readVaultFile, isVaultReady } from './vault-writer';
import { shortHash } from './image-hash';
import type { VisionOutput } from '../agents/vision-agent';
import type { ExtractionOutput } from '../agents/extraction-agent';
import type { PlanningOutput } from '../agents/planning-agent';
import type { QCOutput } from '../agents/qc-agent';

/**
 * Save a complete image analysis record to the vault.
 * Creates: images/{shortHash}/_meta.md, vision.md, extraction.md
 */
export async function saveImageRecord(
  imageHash: string,
  vision: VisionOutput,
  extraction: ExtractionOutput,
  taskId: string,
): Promise<void> {
  if (!isVaultReady()) return;

  const short = shortHash(imageHash);
  const basePath = `images/${short}`;

  // Update _meta.md (append taskId if new)
  await upsertMeta(basePath, imageHash, taskId);

  // Write vision.md
  await writeVaultFile(`${basePath}/vision.md`, formatVisionMd(imageHash, vision, taskId));

  // Write extraction.md
  await writeVaultFile(`${basePath}/extraction.md`, formatExtractionMd(imageHash, extraction, taskId));

  // Update index
  await updateIndex();
}

/**
 * Save a task record to the vault.
 * Creates: tasks/{taskId}/_task.md, planning.md, render.md, qc.md
 */
export async function saveTaskVaultRecord(
  taskId: string,
  imageHashes: string[],
  prompt: string,
  planning: PlanningOutput,
  renderImages: Array<{ b64_json: string; revised_prompt?: string }>,
  qc: QCOutput,
): Promise<void> {
  if (!isVaultReady()) return;

  const basePath = `tasks/${taskId}`;

  // Write _task.md
  await writeVaultFile(`${basePath}/_task.md`, formatTaskMd(taskId, imageHashes, prompt));

  // Write planning.md
  await writeVaultFile(`${basePath}/planning.md`, formatPlanningMd(taskId, imageHashes, planning));

  // Write render.md
  await writeVaultFile(`${basePath}/render.md`, formatRenderMd(taskId, renderImages));

  // Write qc.md
  await writeVaultFile(`${basePath}/qc.md`, formatQcMd(taskId, qc));

  // Update index
  await updateIndex();
}

// --- Markdown formatters ---

function formatVisionMd(imageHash: string, vision: VisionOutput, taskId: string): string {
  const short = shortHash(imageHash);
  const product = vision.product;
  const logo = vision.logo;
  const now = new Date().toISOString();

  return `---
type: vision-analysis
image_hash: ${imageHash}
task_ids: ["${taskId}"]
created_at: ${now}
product_category: ${product?.category || 'unknown'}
product_material: ${product?.material || 'unknown'}
product_color: ${product?.color || 'unknown'}
---
# Vision: ${product?.category || 'Unknown Product'}

**产品**: ${product?.category}, ${product?.material}, ${product?.color}
**形状**: ${product?.shape || 'N/A'}
**特征**: ${(product?.important_features || []).join(', ')}
**数量**: ${product?.count || 1}

**Logo**: ${logo?.exists ? `${logo.brand} (${logo.englishText})` : '无'}

**颜色**: ${(vision.colors || []).join(', ')}
**检测文本**: ${(vision.detectedTexts || []).join(', ')}

## 参考风格
- 构图: ${vision.reference?.composition || 'N/A'}
- 光线: ${vision.reference?.lighting || 'N/A'}
- 色彩风格: ${vision.reference?.color_style || 'N/A'}
- 摄影风格: ${vision.reference?.photography_style || 'N/A'}

## 关联
- 原始图片: [[images/${short}/_meta]]
- 抠图: [[images/${short}/extraction]]
- 任务: [[tasks/${taskId}/_task]]
`;
}

function formatExtractionMd(imageHash: string, extraction: ExtractionOutput, taskId: string): string {
  const short = shortHash(imageHash);
  const bbox = extraction.productBbox;
  const now = new Date().toISOString();

  return `---
type: extraction-result
image_hash: ${imageHash}
task_ids: ["${taskId}"]
created_at: ${now}
bbox_x: ${bbox.x}
bbox_y: ${bbox.y}
bbox_width: ${bbox.width}
bbox_height: ${bbox.height}
aspect_ratio: ${(bbox.width / Math.max(bbox.height, 1)).toFixed(2)}
---
# Extraction: 资产提取

**产品抠图**: ${extraction.productCutout ? '✅ 已提取' : '❌ 失败'}
**BBox**: ${bbox.x}, ${bbox.y}, ${bbox.width}x${bbox.height}
**宽高比**: ${(bbox.width / Math.max(bbox.height, 1)).toFixed(2)}:1

**Logo**: ${extraction.logoCutout ? '✅ 已提取' : '❌ 无/失败'}
**Logo BBox**: ${extraction.logoBbox.x}, ${extraction.logoBbox.y}, ${extraction.logoBbox.width}x${extraction.logoBbox.height}

## 关联
- 原始图片: [[images/${short}/_meta]]
- 视觉分析: [[images/${short}/vision]]
- 任务: [[tasks/${taskId}/_task]]
`;
}

function formatPlanningMd(taskId: string, imageHashes: string[], planning: PlanningOutput): string {
  const now = new Date().toISOString();
  const imageLinks = imageHashes.map(h => `[[images/${shortHash(h)}/_meta]]`).join(', ');

  return `---
type: planning-result
task_id: ${taskId}
created_at: ${now}
layout: ${planning.style?.layout || 'center_product'}
lighting: ${planning.style?.lighting || 'soft_studio'}
size: ${planning.generationParams?.size || '1024x1536'}
quality: ${planning.generationParams?.quality || 'high'}
---
# Planning: 方案规划

## 文案
- **品牌**: ${planning.copy?.brandName || 'N/A'}
- **英文**: ${planning.copy?.brandEnglish || 'N/A'}
- **主标题**: ${planning.copy?.headline || 'N/A'}
- **副标题**: ${planning.copy?.subHeadline || 'N/A'}
- **卖点**: ${(planning.copy?.sellingPoints || []).join(' | ')}
- **调性**: ${planning.copy?.tone || 'N/A'}

## 风格
- **布局**: ${planning.style?.layout || 'N/A'}
- **光线**: ${planning.style?.lighting || 'N/A'}
- **氛围**: ${planning.style?.mood || 'N/A'}
- **主色**: ${planning.style?.palette?.primary || 'N/A'}
- **强调色**: ${planning.style?.palette?.accent || 'N/A'}

## 提示词
\`\`\`
${planning.prompt || 'N/A'}
\`\`\`

## 关联
- 任务: [[tasks/${taskId}/_task]]
- 图片: ${imageLinks}
`;
}

function formatRenderMd(taskId: string, images: Array<{ b64_json: string; revised_prompt?: string }>): string {
  const now = new Date().toISOString();

  return `---
type: render-result
task_id: ${taskId}
created_at: ${now}
image_count: ${images.length}
---
# Render: 图片生成

**生成数量**: ${images.length} 张

${images.map((img, i) => `## 图片 ${i + 1}
**修正提示词**: ${img.revised_prompt || 'N/A'}
`).join('\n')}

## 关联
- 任务: [[tasks/${taskId}/_task]]
`;
}

function formatQcMd(taskId: string, qc: QCOutput): string {
  const now = new Date().toISOString();

  return `---
type: qc-result
task_id: ${taskId}
created_at: ${now}
overall_score: ${qc.overallScore}
pass: ${qc.pass}
product_similarity: ${qc.productSimilarity}
text_accuracy: ${qc.textAccuracy}
---
# QC: 质量检查

**总分**: ${qc.overallScore}/100
**结果**: ${qc.pass ? '✅ 通过' : '❌ 未通过'}
**产品相似度**: ${qc.productSimilarity}
**文字准确度**: ${qc.textAccuracy}
**摘要**: ${qc.summary || 'N/A'}

**违规项**: ${(qc.violations || []).length > 0 ? qc.violations.join(', ') : '无'}
**建议**: ${(qc.suggestions || []).length > 0 ? qc.suggestions.join(', ') : '无'}

## 关联
- 任务: [[tasks/${taskId}/_task]]
`;
}

function formatTaskMd(taskId: string, imageHashes: string[], prompt: string): string {
  const now = new Date().toISOString();
  const imageLinks = imageHashes.map(h => `- [[images/${shortHash(h)}/_meta]]`).join('\n');

  return `---
type: task
task_id: ${taskId}
created_at: ${now}
status: completed
image_count: ${imageHashes.length}
---
# Task: ${taskId}

**用户输入**: ${prompt}

## 使用图片
${imageLinks}

## 流程
1. [[tasks/${taskId}/_task|概览]]
2. [[images/*/vision|视觉分析]] (按图片缓存)
3. [[images/*/extraction|资产提取]] (按图片缓存)
4. [[tasks/${taskId}/planning|方案规划]]
5. [[tasks/${taskId}/render|图片生成]]
6. [[tasks/${taskId}/qc|质量检查]]
`;
}

// --- Index management ---

async function upsertMeta(basePath: string, imageHash: string, taskId: string): Promise<void> {
  const short = shortHash(imageHash);
  const existing = await readVaultFile(`${basePath}/_meta.md`);

  if (existing) {
    // Append taskId to existing meta
    const updated = existing.replace(
      /task_ids: \[(.*?)\]/,
      (match, inner) => {
        const ids = inner ? inner.split(',').map((s: string) => s.trim().replace(/"/g, '')) : [];
        if (!ids.includes(taskId)) ids.push(taskId);
        return `task_ids: [${ids.map((id: string) => `"${id}"`).join(', ')}]`;
      }
    );
    await writeVaultFile(`${basePath}/_meta.md`, updated);
  } else {
    // Create new meta
    const now = new Date().toISOString();
    const content = `---
type: image-meta
image_hash: ${imageHash}
task_ids: ["${taskId}"]
created_at: ${now}
---
# Image: ${short}

**Hash**: \`${imageHash}\`
**短ID**: ${short}

## 分析
- [[images/${short}/vision|视觉分析]]
- [[images/${short}/extraction|资产提取]]

## 关联任务
- [[tasks/${taskId}/_task]]
`;
    await writeVaultFile(`${basePath}/_meta.md`, content);
  }
}

async function updateIndex(): Promise<void> {
  const now = new Date().toISOString();
  const content = `---
type: index
updated_at: ${now}
---
# 电商海报知识库

## 图片库
[[images/]] - 所有已分析的图片（按 SHA-256 哈希索引）

## 任务记录
[[tasks/]] - 所有海报生成任务

## 流程说明
1. 上传图片 → 计算 SHA-256 哈希
2. 检查缓存 → 命中则跳过分析
3. Vision 视觉分析 → 存入 \`images/{hash}/vision.md\`
4. Extraction 资产提取 → 存入 \`images/{hash}/extraction.md\`
5. Planning 方案规划 → 存入 \`tasks/{taskId}/planning.md\`
6. Render 图片生成 → 存入 \`tasks/{taskId}/render.md\`
7. QC 质量检查 → 存入 \`tasks/{taskId}/qc.md\`

## 缓存规则
- Vision/Extraction: 按图片 SHA-256 缓存，相同图片直接命中
- Planning: 按 \`hash(imageHash + userInput)\` 缓存，同图+同提示词才命中
- Render/QC: 不缓存，每次都重新生成
`;
  await writeVaultFile('_index.md', content);
}

