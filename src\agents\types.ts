// Agent system types for the multi-agent e-commerce poster pipeline

import type { ApiConfig, GenParams } from '../types';

// Image role classification from user uploads
export type ImageRole = 'main' | 'logo' | 'detail' | 'reference' | 'competitor' | 'scene';

export interface ClassifiedImage {
  index: number;
  base64: string;
  role: ImageRole;
  label: string;
}

// Input to each agent
export interface AgentInput {
  taskId: string;
  config: ApiConfig;
  images: ClassifiedImage[];
  userInput: string;
  params: GenParams;
  previousOutputs: Record<string, AgentOutput>;
  signal?: AbortSignal;
}

// Output from each agent
export interface AgentOutput {
  agentId: string;
  status: 'success' | 'failed' | 'skipped';
  data: any; // Structured JSON - each agent defines its own shape
  duration: number; // ms
  error?: string;
  startedAt: number;
  completedAt: number;
}

// Agent progress event
export type AgentProgressStatus = 'waiting' | 'running' | 'success' | 'failed' | 'skipped';

export interface AgentProgressEvent {
  agentId: string;
  agentName: string;
  status: AgentProgressStatus;
  message?: string;
  duration?: number;
}

// Pipeline input
export interface PipelineInput {
  taskId: string;
  config: ApiConfig;
  images: ClassifiedImage[];
  userInput: string;
  params: GenParams;
  signal?: AbortSignal;
}

// Pipeline result
export interface PipelineResult {
  outputs: Record<string, AgentOutput>;
  finalImages: Array<{ b64_json: string; revised_prompt?: string }>;
  totalDuration: number;
  retries: number;
}

// Pipeline progress callback
export type PipelineProgressCallback = (event: AgentProgressEvent) => void;

// ========== Agent-specific output types ==========

// [1] Asset Analysis output
export interface AssetAnalysisOutput {
  products: Array<{ index: number; role: string; category: string; count: number }>;
  logos: Array<{ index: number; brand: string; hasText: boolean }>;
  references: Array<{ index: number; style: string; layout: string }>;
  colors: string[];
  materials: string[];
  overallStyle: string;
  detectedTexts: string[];
}

// [2] Product Extraction output
export interface ProductExtractionOutput {
  cutoutBase64: string;
  bbox: { x: number; y: number; width: number; height: number };
  description: {
    name: string;
    category: string;
    color: string;
    material: string;
    shape: string;
    important_features: string[];
  };
}

// [3] Logo Extraction output
export interface LogoExtractionOutput {
  logoBase64: string;
  brand: string;
  hasEnglishText: boolean;
  englishText: string;
  position: string;
  usageRule: 'keep_original_never_regenerate';
}

// [4] Marketing Copy output
export interface CopyAnalysisOutput {
  brandName: string;
  brandEnglish: string;
  heritageLine: string;
  headline: string;
  subHeadline: string;
  sellingPoints: string[];
  footerText: string;
  tone: string;
  targetPlatform: string;
}

// [5] Style Analysis output
export interface StyleAnalysisOutput {
  layout: { type: string; balance: string; textZone: string };
  lighting: { type: string; keyLight: string; shadow: string };
  palette: { primary: string; accent: string; text: string };
  style: string;
  surface: string;
  mood: string;
  typography: { headlineWeight: string; brandFont: string };
}

// [6] Design Planning output
export interface DesignPlanOutput {
  posterType: string;
  size: string;
  layout: Record<string, { y: string; content: string }>;
  background: string;
  visualFocus: string;
  emotion: string;
  referencePriority: string[];
}

// [7] Prompt Engineering output
export interface PromptEngineeringOutput {
  prompt: string;
  negativePrompt: string;
  referencePriority: string[];
  generationParams: {
    size: string;
    quality: string;
    n: number;
  };
}

// [8] Image Generation output
export interface ImageGenerationOutput {
  images: Array<{ b64_json: string; revised_prompt?: string }>;
  promptUsed: string;
  referenceImagesUsed: string[];
  generationParams: { size: string; quality: string };
}

// [9] Quality Check output
export interface QualityCheckOutput {
  productSimilarity: number;
  logoMatch: number;
  textAccuracy: number;
  overallScore: number;
  pass: boolean;
  violations: string[];
  summary: string;
  suggestions: string[];
}

