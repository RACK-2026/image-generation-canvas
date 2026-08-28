/**
 * 提示词图谱 - Prompt Knowledge Graph
 * 
 * 核心思路：
 * - 每次生图的提示词被拆解为图谱节点（风格/构图/色彩/光线/氛围/修饰词）
 * - 好评案例的节点权重增加，差评的减少
 * - 下次生成同类型图片时，直接从图谱中检索高分节点，快速组装提示词
 * - 随着使用次数增加，图谱越来越精准，提示词生成速度越来越快
 * 
 * 每个用户独立图谱，互不干扰
 */

import type { GenerationCase, ImageFeedback } from './types';

// 图谱节点类型
export type GraphNodeType = 'style' | 'composition' | 'color' | 'lighting' | 'mood' | 'modifier' | 'subject' | 'scene';

// 图谱节点
export interface GraphNode {
  id: string;           // 节点ID（文本hash）
  text: string;         // 节点文本（如 "photorealistic", "dark background"）
  type: GraphNodeType;  // 节点类型
  score: number;        // 权重分数（好评+1，差评-1）
  usageCount: number;   // 使用次数
  successCount: number; // 成功次数（好评）
  failCount: number;    // 失败次数（差评）
  categories: string[]; // 关联的图片分类（电商海报/产品图等）
  lastUsed: number;     // 最后使用时间
}

// 节点之间的关联（共现关系）
export interface GraphEdge {
  from: string;  // 源节点ID
  to: string;    // 目标节点ID
  weight: number; // 关联强度（共现次数）
  successWeight: number; // 成功共现权重
}

// 图谱数据库
export interface PromptGraphDB {
  version: string;
  nodes: Record<string, GraphNode>;  // nodeId -> node
  edges: GraphEdge[];
  categoryTemplates: Record<string, {
    // 每个分类的最佳节点组合模板
    topNodes: string[];     // 高分节点ID列表
    avgScore: number;       // 平均分数
    caseCount: number;      // 案例数
  }>;
  updatedAt: number;
}

// 提示词片段提取规则
const TYPE_PATTERNS: { type: GraphNodeType; patterns: RegExp[] }[] = [
  {
    type: 'style',
    patterns: [
      /photorealistic/i, /realistic/i, /hyperrealistic/i, /ultra[- ]realistic/i,
      /digital art/i, /illustration/i, /watercolor/i, /oil painting/i,
      /3d render/i, /cinematic/i, /minimalist/i, /vintage/i, /retro/i,
      /cyberpunk/i, /anime/i, /cartoon/i, /sketch/i, /concept art/i,
      /commercial photography/i, /product photography/i, /studio photography/i,
      /professional/i, /premium/i, /high[- ]end/i, /luxury/i,
    ],
  },
  {
    type: 'composition',
    patterns: [
      /close[- ]up/i, /macro/i, /wide angle/i, /panoramic/i,
      /centered/i, /rule of thirds/i, /symmetric/i, /asymmetric/i,
      /diagonal/i, /overhead/i, /bird['']s eye/i, /low angle/i,
      /hero shot/i, /flat lay/i, /three[- ]quarter/i,
      /vertical composition/i, /horizontal composition/i,
    ],
  },
  {
    type: 'color',
    patterns: [
      /dark background/i, /black background/i, /white background/i,
      /warm tones/i, /cool tones/i, /golden/i, /red accent/i,
      /high contrast/i, /monochrome/i, /vibrant/i, /muted/i,
      /saturated/i, /desaturated/i, /neon/i, /pastel/i,
      /charcoal/i, /deep blue/i, /warm golden/i,
    ],
  },
  {
    type: 'lighting',
    patterns: [
      /dramatic lighting/i, /soft lighting/i, /hard lighting/i,
      /rim light/i, /backlight/i, /spotlight/i, /natural light/i,
      /studio light/i, /key light/i, /fill light/i,
      /low[- ]key/i, /high[- ]key/i, /chiaroscuro/i,
      /cinematic lighting/i, /volumetric lighting/i,
      /strong rim light/i, /focused spotlight/i,
    ],
  },
  {
    type: 'mood',
    patterns: [
      /dramatic/i, /moody/i, /atmospheric/i, /ethereal/i,
      /powerful/i, /elegant/i, /sophisticated/i, /bold/i,
      /premium and powerful/i, /luxurious/i, /intense/i,
      /serene/i, /dynamic/i, /energetic/i,
    ],
  },
  {
    type: 'modifier',
    patterns: [
      /sharp/i, /crisp/i, /detailed/i, /intricate/i,
      /8k/i, /4k/i, /high resolution/i, /ultra detailed/i,
      /professional quality/i, /award winning/i,
      /trending on artstation/i, /masterpiece/i,
      /razor[- ]sharp/i, /mirror[- ]like/i, /flawless/i,
    ],
  },
  {
    type: 'subject',
    patterns: [
      /kitchen knife/i, /cleaver/i, /chef['']s knife/i, /blade/i,
      /product/i, /object/i, /person/i, /portrait/i,
      /food/i, /landscape/i, /building/i, /vehicle/i,
    ],
  },
  {
    type: 'scene',
    patterns: [
      /kitchen counter/i, /cutting board/i, /studio setup/i,
      /dark surface/i, /marble/i, /wooden/i, /metallic/i,
      /outdoor/i, /indoor/i, /urban/i, /nature/i,
    ],
  },
];

function hashText(text: string): string {
  let hash = 0;
  const lower = text.toLowerCase().trim();
  for (let i = 0; i < lower.length; i++) {
    hash = ((hash << 5) - hash) + lower.charCodeAt(i);
    hash = hash & hash;
  }
  return 'n_' + Math.abs(hash).toString(36);
}

function detectNodeType(text: string): GraphNodeType {
  const lower = text.toLowerCase();
  for (const { type, patterns } of TYPE_PATTERNS) {
    if (patterns.some(p => p.test(lower))) {
      return type;
    }
  }
  return 'modifier'; // 默认归类为修饰词
}

// 将提示词拆解为图谱节点
export function extractPromptNodes(prompt: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();

  // 按逗号、句号拆分提示词为片段
  const fragments = prompt.split(/[,.;]\s*/).filter(f => f.trim().length > 2);

  for (const fragment of fragments) {
    const trimmed = fragment.trim();
    if (trimmed.length < 3 || trimmed.length > 80) continue;

    const nodeId = hashText(trimmed);
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    const type = detectNodeType(trimmed);
    nodes.push({
      id: nodeId,
      text: trimmed,
      type,
      score: 0,
      usageCount: 0,
      successCount: 0,
      failCount: 0,
      categories: [],
      lastUsed: 0,
    });
  }

  return nodes;
}

export class PromptGraph {
  private db: PromptGraphDB;
  private userId: string;

  constructor(userId: string = 'default') {
    this.userId = userId;
    this.db = this.loadDB();
  }

  private loadDB(): PromptGraphDB {
    try {
      const saved = localStorage.getItem(`prompt_graph_${this.userId}`);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore invalid local data */ }
    return this.createEmptyDB();
  }

  private createEmptyDB(): PromptGraphDB {
    return {
      version: '1.0.0',
      nodes: {},
      edges: [],
      categoryTemplates: {},
      updatedAt: Date.now(),
    };
  }

  private saveDB(): void {
    this.db.updatedAt = Date.now();
    localStorage.setItem(`prompt_graph_${this.userId}`, JSON.stringify(this.db));
  }

  // 从案例中学习，更新图谱
  learnFromCase(caseRecord: GenerationCase, feedbacks: ImageFeedback[]): void {
    const isPositive = feedbacks.some(f => f.rating === 'good');
    const isNegative = feedbacks.some(f => f.rating === 'bad');
    const category = caseRecord.params.category || '通用';

    // 从最终提示词中提取节点
    const promptText = caseRecord.finalPrompt || caseRecord.enhancedPrompt || caseRecord.userInput;
    const newNodes = extractPromptNodes(promptText);

    const now = Date.now();
    const scoreDelta = isPositive ? 1 : isNegative ? -1 : 0;

    // 更新或创建节点
    for (const node of newNodes) {
      if (this.db.nodes[node.id]) {
        const existing = this.db.nodes[node.id];
        existing.score += scoreDelta;
        existing.usageCount++;
        if (isPositive) existing.successCount++;
        if (isNegative) existing.failCount++;
        if (!existing.categories.includes(category)) {
          existing.categories.push(category);
        }
        existing.lastUsed = now;
      } else {
        this.db.nodes[node.id] = {
          ...node,
          score: scoreDelta,
          usageCount: 1,
          successCount: isPositive ? 1 : 0,
          failCount: isNegative ? 1 : 0,
          categories: [category],
          lastUsed: now,
        };
      }
    }

    // 更新节点间的关联（共现关系）
    const nodeIds = newNodes.map(n => n.id);
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const fromId = nodeIds[i];
        const toId = nodeIds[j];
        const existingEdge = this.db.edges.find(
          e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
        );
        if (existingEdge) {
          existingEdge.weight++;
          if (isPositive) existingEdge.successWeight++;
        } else {
          this.db.edges.push({
            from: fromId,
            to: toId,
            weight: 1,
            successWeight: isPositive ? 1 : 0,
          });
        }
      }
    }

    // 更新分类模板
    if (!this.db.categoryTemplates[category]) {
      this.db.categoryTemplates[category] = { topNodes: [], avgScore: 0, caseCount: 0 };
    }
    const template = this.db.categoryTemplates[category];
    template.caseCount++;

    // 重新计算该分类下的最佳节点
    const categoryNodes = Object.values(this.db.nodes)
      .filter(n => n.categories.includes(category) && n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(n => n.id);

    template.topNodes = categoryNodes;
    template.avgScore = categoryNodes.length > 0
      ? categoryNodes.reduce((sum, id) => sum + (this.db.nodes[id]?.score || 0), 0) / categoryNodes.length
      : 0;

    this.saveDB();
  }

  // 根据分类和意图快速检索提示词片段
  getTopFragments(category: string, count: number = 10): string[] {
    const template = this.db.categoryTemplates[category];
    if (!template || template.topNodes.length === 0) {
      // 没有该分类的数据，返回通用高分节点
      return this.getGlobalTopFragments(count);
    }

    return template.topNodes
      .slice(0, count)
      .map(id => this.db.nodes[id])
      .filter(n => n && n.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(n => n.text);
  }

  // 全局高分节点
  getGlobalTopFragments(count: number = 10): string[] {
    return Object.values(this.db.nodes)
      .filter(n => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(n => n.text);
  }

  // 获取图谱统计
  getStats() {
    const totalNodes = Object.keys(this.db.nodes).length;
    const positiveNodes = Object.values(this.db.nodes).filter(n => n.score > 0).length;
    const totalEdges = this.db.edges.length;
    const categories = Object.keys(this.db.categoryTemplates);

    return {
      totalNodes,
      positiveNodes,
      totalEdges,
      categories,
      categoryDetails: Object.entries(this.db.categoryTemplates).map(([name, data]) => ({
        name,
        nodeCount: data.topNodes.length,
        avgScore: Math.round(data.avgScore * 10) / 10,
        caseCount: data.caseCount,
      })),
    };
  }

  // 清除图谱
  clear(): void {
    this.db = this.createEmptyDB();
    localStorage.removeItem(`prompt_graph_${this.userId}`);
  }

  // 导出图谱数据
  exportDB(): PromptGraphDB {
    return JSON.parse(JSON.stringify(this.db));
  }

  // 导入图谱数据
  importDB(data: PromptGraphDB): void {
    this.db = data;
    this.saveDB();
  }
}

// 单例管理
const instances: Record<string, PromptGraph> = {};
export function getPromptGraph(userId: string = 'default'): PromptGraph {
  if (!instances[userId]) {
    instances[userId] = new PromptGraph(userId);
  }
  return instances[userId];
}

