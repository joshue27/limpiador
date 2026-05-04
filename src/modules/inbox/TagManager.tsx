'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type TagManagerProps = {
  conversationId: string;
  currentTags: string[];
  activeTags: Array<{ id: string; code: string; name: string }>;
};

export function TagManager({ conversationId, currentTags, activeTags }: TagManagerProps) {
  const router = useRouter();
  const [tags, setTags] = useState(currentTags);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const selectable = activeTags.filter((t) => !tags.includes(t.code));

  async function updateTags(nextTags: string[]) {
    setPending(true);
    try {
      await fetch(`/api/inbox/${conversationId}/contact-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tags: nextTags }),
      });
      setTags(nextTags);
      router.refresh();
    } catch {
      // silently fail
    } finally {
      setPending(false);
    }
  }

  async function removeTag(code: string) {
    await updateTags(tags.filter((t) => t !== code));
  }

  async function addTag(code: string) {
    if (!code) return;
    setOpen(false);
    await updateTags([...tags, code]);
  }

  return (
    <div className="contact-tags-compact" aria-label="Etiquetas del contacto">
      {tags.length ? tags.map((contactTag) => (
        <span key={contactTag} className="tag-chip tag-chip-editable">
          {activeTags.find((t) => t.code === contactTag)?.name ?? contactTag}
          <button
            type="button"
            className="tag-remove-button"
            disabled={pending}
            aria-label={`Quitar etiqueta ${activeTags.find((t) => t.code === contactTag)?.name ?? contactTag}`}
            onClick={() => removeTag(contactTag)}
          >
            ×
          </button>
        </span>
      )) : <span className="status-muted">Sin etiquetas asignadas.</span>}
      <div className="tag-add-control">
        <button
          type="button"
          className="tag-add-trigger"
          aria-label="Agregar etiqueta"
          onClick={() => setOpen(!open)}
          disabled={pending || !selectable.length}
        >
          ＋
        </button>
        {open && selectable.length > 0 && (
          <div className="tag-add-popover">
            {selectable.map((tagItem) => (
              <button
                key={tagItem.id}
                type="button"
                className="tag-add-option"
                onClick={() => addTag(tagItem.code)}
              >
                {tagItem.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
