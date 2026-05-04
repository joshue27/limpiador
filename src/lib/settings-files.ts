import path from 'node:path';

export function settingsFilePath(filename: string): string {
  return path.join(process.env.CONFIG_DIR || process.cwd(), filename);
}
