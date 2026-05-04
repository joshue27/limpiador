type RestoreZipEntryPlan = { name: string; size?: number };

export type RestoreZipGuardOptions = {
  maxEntries: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
};

export type RestoreZipGuardResult =
  | { ok: true }
  | { ok: false; status: 413; error: string };

export function validateRestoreZipEntryPlan(
  entries: RestoreZipEntryPlan[],
  options: RestoreZipGuardOptions,
): RestoreZipGuardResult {
  if (entries.length > options.maxEntries) {
    return { ok: false, status: 413, error: 'El ZIP contiene demasiados archivos.' };
  }

  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.size === undefined) continue;
    if (entry.size > options.maxEntryBytes) {
      return { ok: false, status: 413, error: 'Un archivo del ZIP excede el tamaño máximo permitido.' };
    }
    totalBytes += entry.size;
    if (totalBytes > options.maxTotalBytes) {
      return { ok: false, status: 413, error: 'El contenido descomprimido del ZIP excede el tamaño máximo permitido.' };
    }
  }

  return { ok: true };
}
