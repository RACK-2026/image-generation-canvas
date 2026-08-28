import type { FidelityStatus, PixelBounds, ProductExtractionMethod } from './image/types';

// Task status
export type TaskStatus = 'pending' | 'processing' | 'success' | 'failure' | 'interrupted';
export type FilterStatus = 'all' | TaskStatus;

// Image generation parameters
export interface GenParams {
  size: string;
  quality: 'auto' | 'low' | 'medium' | 'high';
  output_format: 'png' | 'jpeg' | 'webp';
  output_compression: number | null;
  moderation: 'auto' | 'low';
  n: number;
  transparent_output: boolean;
}

// Size config
export type SizeMode = 'auto' | 'ratio' | 'custom';
export interface SizeConfig {
  mode: SizeMode;
  baseResolution: '1K' | '2K' | '4K';
  ratio: string;
  customWidth: number;
  customHeight: number;
}

// API config
export interface ApiConfig {
  service: string;
  baseUrl: string;
  submitEndpoint: string;
  queryEndpoint: string;
  model: string;
  apiKey: string;
  apiMode: 'images' | 'responses';
  // Text model for prompt enhancement
  textModel: string;
  // Number of images to generate per task
  imageCount: number;
  // Whether to use AI prompt enhancement
  enhancePrompt: boolean;
  // Keep source product pixels and generate only the background when a reference image exists.
  strictComposition: boolean;
}

// Task record
export interface TaskRecord {
  id: string;
  prompt: string;
  params: GenParams;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  images: GeneratedImage[];
  failReason?: string;
  referenceImages?: string[];
  sourcePrompt?: string;
  generationMode?: 'standard' | 'strict-composite';
  fidelityStatus?: FidelityStatus;
  fidelityWarnings?: string[];
  canResume?: boolean; // True if pipeline was interrupted and can be resumed
  productExtraction?: {
    method: ProductExtractionMethod;
    confidence: number;
  };
  favorite?: boolean;
  collectionId?: string;
}

// Generated image
export interface GeneratedImage {
  b64_json: string;
  revised_prompt?: string;
  generationMode?: 'standard' | 'strict-composite';
  fidelityStatus?: FidelityStatus;
  fidelityWarnings?: string[];
  productBounds?: PixelBounds;
}

// Collection
export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  taskIds: string[];
}

// Settings
export interface AppSettings {
  preferences: {
    submitOnEnter: boolean;
    clearAfterSubmit: boolean;
    refImageAction: 'ask' | 'replace' | 'mask';
    loadLastInput: boolean;
    reuseApiConfig: boolean;
    showRetryOnSuccess: boolean;
    sendNotification: boolean;
    autoScroll: boolean;
    formulaTip: boolean;
  };
  agent: {
    maxToolCalls: number;
    webSearch: boolean;
  };
}

// Default values
export const DEFAULT_PARAMS: GenParams = {
  size: 'auto',
  quality: 'high',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
  transparent_output: false,
};

export const DEFAULT_API_CONFIG: ApiConfig = {
  service: 'Sub2API',
  baseUrl: 'http://192.168.130.125:6363',
  submitEndpoint: '/v1/images/generations',
  queryEndpoint: '/v1/images/generations',
  model: 'gpt-image-2',
  apiKey: import.meta.env.VITE_API_KEY || '',
  apiMode: 'images',
  textModel: 'gpt-5.6-sol',
  imageCount: 3,
  enhancePrompt: true,
  strictComposition: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  preferences: {
    submitOnEnter: false,
    clearAfterSubmit: false,
    refImageAction: 'ask',
    loadLastInput: true,
    reuseApiConfig: false,
    showRetryOnSuccess: false,
    sendNotification: false,
    autoScroll: true,
    formulaTip: true,
  },
  agent: {
    maxToolCalls: 15,
    webSearch: false,
  },
};

export const SIZE_RATIOS = [
  '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9'
];

export const BASE_RESOLUTIONS = ['1K', '2K', '4K'] as const;

