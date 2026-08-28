// Vault Writer - File System Access API for writing Obsidian vault files
// Uses showDirectoryPicker() to get write access to the vault directory

const VAULT_HANDLE_KEY = 'vault-dir-handle';

let vaultHandle: FileSystemDirectoryHandle | null = null;

/**
 * Request user to select the vault directory.
 * Call this once on app startup or when user clicks "初始化知识库".
 */
export async function initVaultDirectory(): Promise<FileSystemDirectoryHandle | null> {
  // Try to restore previously granted handle
  try {
    const stored = await navigator.storage?.get?.();
    // Try getting from IndexedDB
    const db = await openSimpleDB();
    const tx = db.transaction('handles', 'readonly');
    const handle = await tx.store.get('vault-dir');
    if (handle) {
      // Verify permission
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        vaultHandle = handle;
        return handle;
      }
      // Request permission
      const reqPerm = await handle.requestPermission({ mode: 'readwrite' });
      if (reqPerm === 'granted') {
        vaultHandle = handle;
        return handle;
      }
    }
  } catch {
    // No stored handle, proceed to picker
  }

  // Show directory picker
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });
    vaultHandle = handle;

    // Store handle for future sessions
    try {
      const db = await openSimpleDB();
      const tx = db.transaction('handles', 'readwrite');
      await tx.store.put(handle, 'vault-dir');
    } catch {
      // Non-critical: handle won't persist across sessions
    }

    return handle;
  } catch {
    // User cancelled
    return null;
  }
}

/**
 * Get the current vault directory handle (must call initVaultDirectory first).
 */
export function getVaultHandle(): FileSystemDirectoryHandle | null {
  return vaultHandle;
}

/**
 * Check if vault directory is initialized.
 */
export function isVaultReady(): boolean {
  return vaultHandle !== null;
}

/**
 * Write a text file to the vault directory at the given relative path.
 * Creates intermediate directories as needed.
 * @param relativePath e.g. "images/a1b2c3d4/vision.md"
 */
export async function writeVaultFile(relativePath: string, content: string): Promise<void> {
  if (!vaultHandle) throw new Error('Vault directory not initialized');

  const parts = relativePath.split('/').filter(Boolean);
  const fileName = parts.pop()!;

  // Traverse/create directories
  let dirHandle = vaultHandle;
  for (const dirName of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(dirName, { create: true });
  }

  // Write file
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Read a text file from the vault directory.
 * Returns null if file doesn't exist.
 */
export async function readVaultFile(relativePath: string): Promise<string | null> {
  if (!vaultHandle) return null;

  try {
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop()!;

    let dirHandle = vaultHandle;
    for (const dirName of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(dirName);
    }

    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

/**
 * Check if a file exists in the vault.
 */
export async function vaultFileExists(relativePath: string): Promise<boolean> {
  if (!vaultHandle) return false;

  try {
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop()!;

    let dirHandle: FileSystemDirectoryHandle = vaultHandle;
    for (const dirName of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(dirName);
    }

    await dirHandle.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

// Simple IndexedDB for storing directory handles
function openSimpleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vault-handles', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('handles')) {
        req.result.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

