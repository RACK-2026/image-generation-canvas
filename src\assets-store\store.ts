// Asset storage layer - uses shared DB connection from db.ts

import type { IDBPDatabase } from 'idb';
import type { PosterAsset, AssetType } from './types';
import { getDB } from '../db';

// Re-export getDB as getAssetsDB for backward compatibility
export async function getAssetsDB(): Promise<IDBPDatabase> {
  return getDB();
}

// Save an agent output as an asset
export async function saveAsset(asset: PosterAsset): Promise<void> {
  const db = await getAssetsDB();
  await db.put('poster_assets', asset);
}

// Get all assets for a task
export async function getTaskAssets(taskId: string): Promise<PosterAsset[]> {
  const db = await getAssetsDB();
  return db.getAllFromIndex('poster_assets', 'taskId', taskId);
}

// Get assets for a specific agent in a task
export async function getAgentAssets(taskId: string, agentId: string): Promise<PosterAsset[]> {
  const db = await getAssetsDB();
  // Use composite index
  return db.getAllFromIndex('poster_assets', 'taskId_agentId', [taskId, agentId]);
}

// Get a specific asset by type
export async function getAsset(taskId: string, agentId: string, assetType: AssetType): Promise<PosterAsset | undefined> {
  const assets = await getAgentAssets(taskId, agentId);
  return assets.find(a => a.assetType === assetType);
}

// Delete all assets for a task
export async function deleteTaskAssets(taskId: string): Promise<void> {
  const db = await getAssetsDB();
  const assets = await getTaskAssets(taskId);
  const tx = db.transaction('poster_assets', 'readwrite');
  for (const asset of assets) {
    await tx.store.delete(asset.id);
  }
  await tx.done;
}

// Create asset ID
export function makeAssetId(taskId: string, agentId: string, assetType: AssetType): string {
  return `${taskId}_${agentId}_${assetType}`;
}

