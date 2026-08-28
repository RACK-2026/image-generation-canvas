/**
 * 经验进化引擎 - 核心逻辑
 * 
 * 负责：记录案例、分析反馈、学习偏好、优化提示词
 * 数据持久化到 jingyan_jinhua 文件夹（通过 IndexedDB + 导出JSON）
 */

import type { GenerationCase, UserProfile, ExperienceDB, ImageFeedback } from './types';
import { getPromptGraph } from './promptGraph';

const DB_VERSION = '1.0.0';
const DEFAULT_USER_ID = 'default';

// 图片分类识别
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '电商海报': ['电商', '海报', '促销', '价格', '折扣', '限时', '爆款', '热卖', '抖音', 'douyin', 'poster', 'ecommerce'],
  '产品图': ['产品', '白底', '特写', '展示', 'product', 'white background'],
  '人像摄影': ['人像', '人物', '写真', 'portrait', 'person', 'photo'],
  '风景': ['风景', '自然', '山水', 'landscape', 'scenery', 'nature'],
  '插画': ['插画', '卡通', 'anime', 'illustration', 'cartoon'],
  '美食': ['美食', '食物', '餐饮', 'food', 'dish', 'restaurant'],
  '科技': ['科技', '未来', '赛博', 'tech', 'cyber', 'futuristic'],
};

// 风格关键词
const STYLE_KEYWORDS = ['写实', '水彩', '油画', '卡通', '极简', '复古', '赛博朋克', 'photorealistic', 'watercolor', 'oil painting', 'minimalist', 'vintage', 'cyberpunk', 'digital art', '3d render'];
// 色彩关键词
const COLOR_KEYWORDS = ['暖色', '冷色', '金色', '红色', '蓝色', '黑色', '白色', 'warm', 'cool', 'golden', 'red', 'blue', 'dark', 'bright'];
// 构图关键词
const COMPOSITION_KEYWORDS = ['特写', '全景', '俯视', '居中', '对称', 'close-up', 'panoramic', 'centered', 'symmetric'];
// 氛围关键词
const MOOD_KEYWORDS = ['温馨', '科技感', '梦幻', '高端', '大气', 'cozy', 'futuristic', 'dreamy', 'premium', 'luxury'];

function extractKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase()));
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      return category;
    }
  }
  return '通用';
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function calculateSuccessScore(feedbacks: ImageFeedback[]): number {
  if (feedbacks.length === 0) return 50;
  let score = 0;
  for (const f of feedbacks) {
    if (f.rating === 'good') score += 100;
    else if (f.rating === 'ok') score += 50;
    else score += 0;
  }
  return Math.round(score / feedbacks.length);
}

export class ExperienceEngine {
  private db: ExperienceDB;
  private currentUserId: string = DEFAULT_USER_ID;

  constructor() {
    this.db = this.loadDB();
  }

  private loadDB(): ExperienceDB {
    try {
      const saved = localStorage.getItem('jingyan_db');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load experience DB:', e);
    }
    return this.createEmptyDB();
  }

  private createEmptyDB(): ExperienceDB {
    return {
      version: DB_VERSION,
      cases: [],
      profiles: {},
      globalStats: {
        totalCases: 0,
        totalFeedbacks: 0,
        avgAcceptanceRate: 0,
        topCategories: [],
      },
      updatedAt: Date.now(),
    };
  }

  private saveDB(): void {
    this.db.updatedAt = Date.now();
    localStorage.setItem('jingyan_db', JSON.stringify(this.db));
  }

  // 手动导出经验数据到JSON文件（用户触发）
  exportToJSON(): void {
    const dataStr = JSON.stringify(this.db, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jingyan_jinhua_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 设置当前用户ID
  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
    if (!this.db.profiles[userId]) {
      this.db.profiles[userId] = this.createEmptyProfile(userId);
    }
  }

  getCurrentUserId(): string {
    return this.currentUserId;
  }

  private createEmptyProfile(userId: string): UserProfile {
    return {
      userId,
      preferredStyles: {},
      preferredColors: {},
      preferredCompositions: {},
      preferredMoods: {},
      categoryPreferences: {},
      preferredKeywords: {},
      avoidedKeywords: {},
      totalGenerations: 0,
      totalGood: 0,
      totalBad: 0,
      totalOk: 0,
      acceptanceRate: 0,
      recentCaseIds: [],
      updatedAt: Date.now(),
    };
  }

  // 记录一次生图案例
  recordCase(
    userInput: string,
    enhancedPrompt: string,
    finalPrompt: string,
    params: { size: string; quality: string },
    imageCount: number,
    revisedPrompts: string[],
    referenceImages?: string[]
  ): GenerationCase {
    const caseId = `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const category = detectCategory(userInput + ' ' + enhancedPrompt);

    const caseRecord: GenerationCase = {
      id: caseId,
      userId: this.currentUserId,
      userInput,
      enhancedPrompt,
      finalPrompt,
      params: { ...params, category },
      referenceImages: referenceImages?.map(hashString),
      imageCount,
      imageHashes: revisedPrompts.map(hashString),
      revisedPrompts,
      feedbacks: [],
      learnedTags: [],
      successScore: 50,
      createdAt: Date.now(),
    };

    this.db.cases.push(caseRecord);
    this.db.globalStats.totalCases++;

    // 更新用户画像
    const profile = this.getOrCreateProfile();
    profile.totalGenerations++;
    profile.recentCaseIds.unshift(caseId);
    if (profile.recentCaseIds.length > 20) {
      profile.recentCaseIds = profile.recentCaseIds.slice(0, 20);
    }

    // 更新类别统计
    if (!profile.categoryPreferences[category]) {
      profile.categoryPreferences[category] = { goodCount: 0, badCount: 0, avgScore: 50, bestPrompts: [] };
    }
    profile.categoryPreferences[category].goodCount++; // 初始算中性

    this.saveDB();
    return caseRecord;
  }

  // 提交用户反馈
  submitFeedback(caseId: string, feedbacks: ImageFeedback[], overallRating?: 'good' | 'bad' | 'ok', userComment?: string): void {
    const caseRecord = this.db.cases.find(c => c.id === caseId);
    if (!caseRecord) return;

    caseRecord.feedbacks = feedbacks;
    caseRecord.overallRating = overallRating;
    caseRecord.userComment = userComment;
    caseRecord.feedbackAt = Date.now();
    caseRecord.successScore = calculateSuccessScore(feedbacks);

    // 提取学习标签
    const allText = caseRecord.enhancedPrompt + ' ' + caseRecord.finalPrompt;
    caseRecord.learnedTags = [
      ...extractKeywords(allText, STYLE_KEYWORDS),
      ...extractKeywords(allText, COLOR_KEYWORDS),
      ...extractKeywords(allText, COMPOSITION_KEYWORDS),
      ...extractKeywords(allText, MOOD_KEYWORDS),
    ];

    // 更新用户画像
    const profile = this.getOrCreateProfile();
    
    for (const f of feedbacks) {
      if (f.rating === 'good') profile.totalGood++;
      else if (f.rating === 'bad') profile.totalBad++;
      else profile.totalOk++;

      // 从好评/差评中学习关键词
      const caseText = caseRecord.enhancedPrompt.toLowerCase();
      const words = caseText.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        if (f.rating === 'good') {
          profile.preferredKeywords[word] = (profile.preferredKeywords[word] || 0) + 1;
        } else if (f.rating === 'bad') {
          profile.avoidedKeywords[word] = (profile.avoidedKeywords[word] || 0) + 1;
        }
      }

      // 学习风格/色彩/构图/氛围
      const styles = extractKeywords(caseText, STYLE_KEYWORDS);
      const colors = extractKeywords(caseText, COLOR_KEYWORDS);
      const compositions = extractKeywords(caseText, COMPOSITION_KEYWORDS);
      const moods = extractKeywords(caseText, MOOD_KEYWORDS);

      const weight = f.rating === 'good' ? 1 : f.rating === 'bad' ? -1 : 0.3;
      styles.forEach(s => { profile.preferredStyles[s] = (profile.preferredStyles[s] || 0) + weight; });
      colors.forEach(c => { profile.preferredColors[c] = (profile.preferredColors[c] || 0) + weight; });
      compositions.forEach(c => { profile.preferredCompositions[c] = (profile.preferredCompositions[c] || 0) + weight; });
      moods.forEach(m => { profile.preferredMoods[m] = (profile.preferredMoods[m] || 0) + weight; });
    }

    // 更新认可率
    const total = profile.totalGood + profile.totalBad + profile.totalOk;
    profile.acceptanceRate = total > 0 ? Math.round((profile.totalGood / total) * 100) : 0;

    // 更新类别
    const category = caseRecord.params.category || '通用';
    if (profile.categoryPreferences[category]) {
      const cat = profile.categoryPreferences[category];
      if (overallRating === 'good') cat.goodCount++;
      else if (overallRating === 'bad') cat.badCount++;
      cat.avgScore = Math.round((cat.goodCount / (cat.goodCount + cat.badCount || 1)) * 100);
      if (overallRating === 'good' && caseRecord.enhancedPrompt) {
        cat.bestPrompts.unshift(caseRecord.enhancedPrompt.slice(0, 200));
        if (cat.bestPrompts.length > 5) cat.bestPrompts = cat.bestPrompts.slice(0, 5);
      }
    }

    this.db.globalStats.totalFeedbacks += feedbacks.length;
    this.db.globalStats.avgAcceptanceRate = profile.acceptanceRate;

    // 同步到提示词图谱
    const graph = getPromptGraph(this.currentUserId);
    graph.learnFromCase(caseRecord, feedbacks);

    this.saveDB();
  }

  // 获取用户偏好画像
  getProfile(): UserProfile {
    return this.getOrCreateProfile();
  }

  private getOrCreateProfile(): UserProfile {
    if (!this.db.profiles[this.currentUserId]) {
      this.db.profiles[this.currentUserId] = this.createEmptyProfile(this.currentUserId);
    }
    return this.db.profiles[this.currentUserId];
  }

  // 获取所有案例
  getCases(limit = 50): GenerationCase[] {
    return this.db.cases
      .filter(c => c.userId === this.currentUserId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // 获取待反馈的案例
  getPendingFeedbackCases(): GenerationCase[] {
    return this.db.cases
      .filter(c => c.userId === this.currentUserId && c.feedbacks.length === 0 && c.successScore === 50)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // 基于经验优化提示词（在AI增强前注入用户偏好 + 图谱片段）
  getPreferenceInjection(): string {
    const profile = this.getProfile();
    const graph = getPromptGraph(this.currentUserId);
    const injections: string[] = [];

    // 从图谱获取高分提示词片段（核心加速机制）
    const topFragments = graph.getGlobalTopFragments(8);
    if (topFragments.length > 0) {
      injections.push(`Proven high-quality prompt fragments: ${topFragments.join(', ')}`);
    }

    // 注入偏好的风格
    const topStyles = Object.entries(profile.preferredStyles)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
    if (topStyles.length > 0) {
      injections.push(`Preferred styles: ${topStyles.join(', ')}`);
    }

    // 注入偏好的色彩
    const topColors = Object.entries(profile.preferredColors)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
    if (topColors.length > 0) {
      injections.push(`Preferred colors: ${topColors.join(', ')}`);
    }

    // 注入偏好的氛围
    const topMoods = Object.entries(profile.preferredMoods)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
    if (topMoods.length > 0) {
      injections.push(`Preferred mood: ${topMoods.join(', ')}`);
    }

    // 注入要避免的关键词
    const avoidWords = Object.entries(profile.avoidedKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k);
    if (avoidWords.length > 0) {
      injections.push(`Avoid these: ${avoidWords.join(', ')}`);
    }

    return injections.join('. ') + '.';
  }

  // 获取指定分类的高分提示词片段
  getCategoryFragments(category: string): string[] {
    const graph = getPromptGraph(this.currentUserId);
    return graph.getTopFragments(category, 8);
  }

  // 导出完整经验数据
  exportAll(): ExperienceDB {
    return JSON.parse(JSON.stringify(this.db));
  }

  // 导入经验数据
  importAll(data: ExperienceDB): void {
    this.db = data;
    this.saveDB();
  }

  // 清除所有数据
  clearAll(): void {
    this.db = this.createEmptyDB();
    localStorage.removeItem('jingyan_db');
  }

  // 获取统计信息
  getStats() {
    const profile = this.getProfile();
    return {
      totalCases: this.db.cases.filter(c => c.userId === this.currentUserId).length,
      totalFeedbacks: profile.totalGood + profile.totalBad + profile.totalOk,
      acceptanceRate: profile.acceptanceRate,
      topCategories: Object.entries(profile.categoryPreferences)
        .sort((a, b) => (b[1].goodCount + b[1].avgScore) - (a[1].goodCount + a[1].avgScore))
        .slice(0, 5)
        .map(([name, data]) => ({ name, ...data })),
      preferredStyles: Object.entries(profile.preferredStyles).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }
}

// 单例
let instance: ExperienceEngine | null = null;
export function getExperienceEngine(): ExperienceEngine {
  if (!instance) {
    instance = new ExperienceEngine();
  }
  return instance;
}

