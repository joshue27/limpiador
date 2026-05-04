export type ComposerAttachmentPill = {
  filename: string;
  removeLabel: string;
};

export function getComposerAttachmentPills(files: Array<{ name: string }>): ComposerAttachmentPill[] {
  return files.flatMap((file) => {
    const filename = file.name.trim();

    if (!filename) return [];

    return [{
      filename,
      removeLabel: 'Quitar adjunto',
    }];
  });
}
