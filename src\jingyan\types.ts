/**
 * 经验进化体系 - 数据类型定义
 * 
 * 记录每次生图案例，学习用户偏好，持续优化提示词质量
 * 支持未来账号ID区分 + 断点续传
 */

// 单张图片的用户反馈
export interface ImageFeedback {
  imageIndex: number;       // 图片在批次中的索引
  rating: 'good' | 'bad' | 'ok';  // 好评/差评/一般
  comment?: string;         // 用户文字评价
  tags?: string[];          // 用户打的标签（如"构图好"、"颜色不对"）
  timestamp: number;
}

// 一次生图的完整案例记录
export interface GenerationCase {
  id: string;
  userId: string;                    // 用户ID（默认 "default"，未来支持多账号）
  
  // 输入
  userInput: string;                 // 用户原始输入
  enhancedPrompt: string;            // AI增强后的提示词
  finalPrompt: string;               // 实际发送给生图模型的提示词
  params: {                          // 生图参数
    size: string;
    quality: string;
    category?: string;               // 图片分类（电商海报/产品图/插画等）
  };
  referenceImages?: string[];        // 参考图hash（不存base64，太大）
  
  // 输出
  imageCount: number;                // 生成了几张
  imageHashes: string[];             // 图片hash（用于去重和匹配）
  revisedPrompts: string[];          // 模型返回的内部提示词
  
  // 反馈
  feedbacks: ImageFeedback[];        // 每张图片的反馈
  overallRating?: 'good' | 'bad' | 'ok';  // 整体评价
  userComment?: string;              // 用户总体评价
  
  // 学习标签
  learnedTags: string[];             // 系统自动提取的标签
  successScore: number;              // 成功分数 0-100
  
  // 时间
  createdAt: number;
  feedbackAt?: number;               // 反馈时间
}

// 用户偏好画像
export interface UserProfile {
  userId: string;
  
  // 风格偏好（从好评案例中提取）
  preferredStyles: Record<string, number>;    // 风格 -> 权重
  preferredColors: Record<string, number>;    // 色彩 -> 权重
  preferredCompositions: Record<string, number>; // 构图 -> 权重
  preferredMoods: Record<string, number>;     // 氛围 -> 权重
  
  // 类别偏好
  categoryPreferences: Record<string, {
    goodCount: number;
    badCount: number;
    avgScore: number;
    bestPrompts: string[];    // 该类别下最好的提示词片段
  }>;
  
  // 提示词偏好
  preferredKeywords: Record<string, number>;  // 关键词 -> 出现频率（好评中）
  avoidedKeywords: Record<string, number>;    // 关键词 -> 出现频率（差评中）
  
  // 统计
  totalGenerations: number;
  totalGood: number;
  totalBad: number;
  totalOk: number;
  acceptanceRate: number;     // 用户认可率
  
  // 最近案例
  recentCaseIds: string[];    // 最近20个案例ID
  
  updatedAt: number;
}

// 经验库总体结构
export interface ExperienceDB {
  version: string;
  cases: GenerationCase[];
  profiles: Record<string, UserProfile>;  // userId -> profile
  globalStats: {
    totalCases: number;
    totalFeedbacks: number;
    avgAcceptanceRate: number;
    topCategories: string[];
  };
  updatedAt: number;
}

// 反馈请求（生成后向用户提问）
export interface FeedbackRequest {
  taskId: string;
  message: string;              // 向用户展示的问题
  images: {
    index: number;
    thumbnail: string;          // base64缩略图
  }[];
}

