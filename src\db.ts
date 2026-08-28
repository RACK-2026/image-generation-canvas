import { openDB, type IDBPDatabase } from 'idb';
import type { TaskRecord, Collection, GeneratedImage } from './types';

const DB_NAME = 'gpt-image-playground';
const DB_VERSION = 4; // v4: added analysis_cache store for knowledge graph caching

let dbInstance: IDBPDatabase | null = null;

export async function getDB() {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tasks')) {
        const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
        taskStore.createIndex('status', 'status');
        taskStore.createIndex('createdAt', 'createdAt');
        taskStore.createIndex('favorite', 'favorite');
        taskStore.createIndex('collectionId', 'collectionId');
      }
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // v3: poster_assets store for agent output persistence
      if (!db.objectStoreNames.contains('poster_assets')) {
        const store = db.createObjectStore('poster_assets', { keyPath: 'id' });
        store.createIndex('taskId', 'taskId');
        store.createIndex('agentId', 'agentId');
        store.createIndex('assetType', 'assetType');
        store.createIndex('taskId_agentId', ['taskId', 'agentId']);
      }
      // v4: analysis_cache for knowledge graph caching (Vision/Extraction/Planning)
      if (!db.objectStoreNames.contains('analysis_cache')) {
        const cacheStore = db.createObjectStore('analysis_cache', { keyPath: 'cacheKey' });
        cacheStore.createIndex('type', 'type');
        cacheStore.createIndex('imageHash', 'imageHash');
        cacheStore.createIndex('createdAt', 'createdAt');
      }
    },
  });
  return dbInstance;
}

// Tasks
export async function saveTask(task: TaskRecord) {
  const db = await getDB();
  await db.put('tasks', task);
}

export async function getTask(id: string): Promise<TaskRecord | undefined> {
  const db = await getDB();
  return db.get('tasks', id);
}

export async function getAllTasks(): Promise<TaskRecord[]> {
  const db = await getDB();
  return db.getAll('tasks');
}

export async function getTasksByStatus(status: string): Promise<TaskRecord[]> {
  const db = await getDB();
  if (status === 'all') return db.getAll('tasks');
  return db.getAllFromIndex('tasks', 'status', status);
}

export async function getFavoriteTasks(): Promise<TaskRecord[]> {
  const db = await getDB();
  const tasks = await db.getAll('tasks');
  return tasks.filter(task => task.favorite === true);
}

export async function deleteTask(id: string) {
  const db = await getDB();
  await db.delete('tasks', id);
}

export async function clearAllTasks() {
  const db = await getDB();
  await db.clear('tasks');
}

// Collections
export async function saveCollection(collection: Collection) {
  const db = await getDB();
  await db.put('collections', collection);
}

export async function getAllCollections(): Promise<Collection[]> {
  const db = await getDB();
  return db.getAll('collections');
}

export async function deleteCollection(id: string) {
  const db = await getDB();
  await db.delete('collections', id);
}

// Settings
export async function saveSetting(key: string, value: any) {
  const db = await getDB();
  await db.put('settings', { key, value });
}

export async function getSetting(key: string): Promise<any> {
  const db = await getDB();
  const result = await db.get('settings', key);
  return result?.value;
}

// Pipeline progress persistence (for breakpoint resume)
export async function savePipelineProgress(taskId: string, events: any[], generatingState: any) {
  const db = await getDB();
  await db.put('settings', {
    key: 'pipeline-progress',
    value: { taskId, events, generatingState, updatedAt: Date.now() },
  });
}

export async function getPipelineProgress(): Promise<{
  taskId: string; events: any[]; generatingState: any; updatedAt: number;
} | null> {
  const db = await getDB();
  const result = await db.get('settings', 'pipeline-progress');
  return result?.value || null;
}

export async function clearPipelineProgress() {
  const db = await getDB();
  await db.delete('settings', 'pipeline-progress');
}

// Pipeline input persistence (for resume after page refresh)
export async function savePipelineInput(taskId: string, input: any) {
  const db = await getDB();
  await db.put('settings', {
    key: `pipeline-input-${taskId}`,
    value: { ...input, savedAt: Date.now() },
  });
}

export async function getPipelineInput(taskId: string): Promise<any | null> {
  const db = await getDB();
  const result = await db.get('settings', `pipeline-input-${taskId}`);
  return result?.value || null;
}

export async function clearPipelineInput(taskId: string) {
  const db = await getDB();
  await db.delete('settings', `pipeline-input-${taskId}`);
}

// Export/Import
export async function exportData(includeImages: boolean): Promise<Blob> {
  const db = await getDB();
  const tasks = await db.getAll('tasks');
  const collections = await db.getAll('collections');
  const settings: Record<string, any> = {};
  const allSettings = await db.getAll('settings');
  for (const s of allSettings) {
    settings[s.key] = s.value;
  }

  const exportData = {
    version: 1,
    exportedAt: Date.now(),
    settings,
    collections,
    tasks: tasks.map(t => ({
      ...t,
      images: includeImages ? t.images : t.images.map((img: GeneratedImage) => ({ ...img, b64_json: '' })),
    })),
  };

  const jsonStr = JSON.stringify(exportData);
  return new Blob([jsonStr], { type: 'application/json' });
}

export async function importData(jsonStr: string) {
  const data = JSON.parse(jsonStr);
  if (data.tasks) {
    for (const task of data.tasks) {
      await saveTask(task);
    }
  }
  if (data.collections) {
    for (const col of data.collections) {
      await saveCollection(col);
    }
  }
  if (data.settings) {
    for (const [key, value] of Object.entries(data.settings)) {
      await saveSetting(key, value);
    }
  }
}

