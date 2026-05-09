import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { getConfig } from '@/lib/config';
import { resolvePrivatePath } from '@/lib/private-files';

export type StorageBrowserKind = 'exports' | 'database';

export type StorageBrowserFileEntry = {
  relativePath: string;
  absolutePath: string;
  size: number;
  modifiedAt: string;
};

export type StorageBrowserRootListing = {
  kind: StorageBrowserKind;
  label: string;
  rootPath: string;
  available: boolean;
  note?: string;
  files: StorageBrowserFileEntry[];
};

const MAX_STORAGE_BROWSER_FILES = 200;

export function storageBrowserRootPath(kind: StorageBrowserKind) {
  if (kind === 'exports') {
    return getConfig().storage.exportRoot;
  }

  return process.env.DB_BACKUP_BROWSER_ROOT?.trim()
    || process.env.BACKUP_DIR?.trim()
    || '/var/backups/limpiador/postgres';
}

export function storageBrowserRootLabel(kind: StorageBrowserKind) {
  return kind === 'exports'
    ? 'ZIPs de exportación y restauración'
    : 'Backups SQL de base de datos';
}

export async function listStorageBrowserRoot(kind: StorageBrowserKind): Promise<StorageBrowserRootListing> {
  const rootPath = storageBrowserRootPath(kind);
  const label = storageBrowserRootLabel(kind);

  try {
    const files = await walkFiles(rootPath, rootPath);
    files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));

    return {
      kind,
      label,
      rootPath,
      available: true,
      files: files.slice(0, MAX_STORAGE_BROWSER_FILES),
      ...(files.length > MAX_STORAGE_BROWSER_FILES
        ? { note: `Se muestran los ${MAX_STORAGE_BROWSER_FILES} archivos más recientes.` }
        : {}),
    };
  } catch (error) {
    return {
      kind,
      label,
      rootPath,
      available: false,
      note: error instanceof Error ? error.message : 'No se pudo acceder a esta ruta.',
      files: [],
    };
  }
}

async function walkFiles(rootPath: string, currentPath: string): Promise<StorageBrowserFileEntry[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: StorageBrowserFileEntry[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(rootPath, entryPath));
      continue;
    }

    if (!entry.isFile()) continue;

    const fileStat = await stat(entryPath);
    files.push({
      relativePath: path.relative(rootPath, entryPath).replaceAll('\\', '/'),
      absolutePath: entryPath,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });
  }

  return files;
}

export async function resolveStorageBrowserFile(kind: StorageBrowserKind, relativePath: string) {
  const rootPath = storageBrowserRootPath(kind);
  const filePath = await resolvePrivatePath(rootPath, relativePath);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    throw new Error('El archivo no existe.');
  }

  return { rootPath, filePath, fileStat };
}

export async function deleteStorageBrowserFile(kind: StorageBrowserKind, relativePath: string) {
  const { filePath } = await resolveStorageBrowserFile(kind, relativePath);
  await rm(filePath, { force: false });
}
