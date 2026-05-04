export const composerEmojiOptions = [
  { value: '😊', label: 'Sonrisa' },
  { value: '👍', label: 'Ok' },
  { value: '🙏', label: 'Gracias' },
  { value: '🎉', label: 'Celebrar' },
  { value: '👀', label: 'Revisar' },
  { value: '⚠️', label: 'Atención' },
  { value: '📌', label: 'Recordatorio' },
  { value: '✅', label: 'Resuelto' },
] as const;

export function insertEmojiIntoComposer(currentValue: string, emoji: string) {
  const trimmedEmoji = emoji.trim();

  if (!trimmedEmoji) {
    return currentValue;
  }

  if (!currentValue) {
    return trimmedEmoji;
  }

  return `${currentValue.trimEnd()} ${trimmedEmoji}`;
}
