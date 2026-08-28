// Analysis Cache - IndexedDB-based cache for Vision/Extraction/Planning results
// Uses SHA-256 image hashes as cache keys for fast lookup

import { getDB } from '../db';
import type { VisionOutput } from '../agents/vision-agent';
import type { ExtractionOutput } from '../agents/extraction-agent';
import type { PlanningOutput } from '../agents/planning-agent';

export interface CacheEntry {
  cacheKey: string;       // e.g. "vision:{imageHash}" or "planning:{planningKey}"
  type: 'vision' | 'extraction' | 'planning';
  imageHash: string;      // SHA-256 of the image (or composite key for planning)
  data: any;              // The cached output (VisionOutput, ExtractionOutput, PlanningOutput)
  createdAt: number;
  hitCount: number;       // How many times this cache was used
}

/**
 * Check if a Vision analysis result is cached for the given image hash.
 */
export async function getCachedVision(imageHash: string): Promise<VisionOutput | null> {
  return getCachedEntry<VisionOutput>(`vision:${imageHash}`);
}

/**
 * Check if an Extraction result is cached for the given image hash.
 */
export async function getCachedExtraction(imageHash: string): Promise<ExtractionOutput | null> {
  return getCachedEntry<ExtractionOutput>(`extraction:${imageHash}`);
}

/**
 * Check if a Planning result is cached for the given composite key.
 * Planning depends on both image content AND user input.
 */
export async function getCachedPlanning(planningKey: string): Promise<PlanningOutput | null> {
  return getCachedEntry<PlanningOutput>(`planning:${planningKey}`);
}

/**
 * Save a Vision analysis result to cache.
 */
export async function saveVisionCache(imageHash: string, data: VisionOutput): Promise<void> {
  await saveCacheEntry(`vision:${imageHash}`, 'vision', imageHash, data);
}

/**
 * Save an Extraction result to cache.
 */
export async function saveExtractionCache(imageHash: string, data: ExtractionOutput): Promise<void> {
  await saveCacheEntry(`extraction:${imageHash}`, 'extraction', imageHash, data);
}

/**
 * Save a Planning result to cache.
 */
export async function savePlanningCache(planningKey: string, imageHash: string, data: PlanningOutput): Promise<void> {
  await saveCacheEntry(`planning:${planningKey}`, 'planning', imageHash, data);
}

/**
 * Get cache statistics for display.
 */
export async function getCacheStats(): Promise<{ total: number; vision: number; extraction: number; planning: number }> {
  const db = await getDB();
  const all = await db.getAll('analysis_cache');
  return {
    total: all.length,
    vision: all.filter(e => e.type === 'vision').length,
    extraction: all.filter(e => e.type === 'extraction').length,
    planning: all.filter(e => e.type === 'planning').length,
  };
}

// --- Internal helpers ---

async function getCachedEntry<T>(cacheKey: string): Promise<T | null> {
  try {
    const db = await getDB();
    const entry = await db.get('analysis_cache', cacheKey);
    if (!entry) return null;

    // Increment hit count
    entry.hitCount = (entry.hitCount || 0) + 1;
    await db.put('analysis_cache', entry);

    return entry.data as T;
  } catch {
    return null;
  }
}

async function saveCacheEntry(
  cacheKey: string,
  type: 'vision' | 'extraction' | 'planning',
  imageHash: string,
  data: any,
): Promise<void> {
  try {
    const db = await getDB();
    const entry: CacheEntry = {
      cacheKey,
      type,
      imageHash,
      data,
      createdAt: Date.now(),
      hitCount: 0,
    };
    await db.put('analysis_cache', entry);
  } catch (err) {
    console.warn('[Cache] Failed to save entry:', err);
  }
}

