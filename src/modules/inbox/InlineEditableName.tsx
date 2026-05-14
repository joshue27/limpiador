'use client';

import { useState, useRef, useCallback } from 'react';

type InlineEditableNameProps = {
  contactId: string;
  displayName: string | null;
  phone: string;
  waId: string;
};

export function InlineEditableName({
  contactId,
  displayName,
  phone,
  waId,
}: InlineEditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [currentName, setCurrentName] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = useCallback(
    async (newValue: string) => {
      const trimmed = newValue.trim();
      if (trimmed === (currentName ?? '')) {
        setEditing(false);
        return;
      }

      setSaving(true);
      try {
        const res = await fetch('/api/contacts/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: contactId,
            waId,
            displayName: trimmed || null,
          }),
        });
        if (!res.ok) throw new Error('Error al guardar');
        setCurrentName(trimmed || null);
        setValue(trimmed);
      } catch {
        setValue(currentName ?? '');
      } finally {
        setSaving(false);
        setEditing(false);
      }
    },
    [contactId, waId, currentName],
  );

  const handleDoubleClick = useCallback(() => {
    setValue(currentName ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [currentName]);

  if (editing) {
    return (
      <h3 style={{ margin: 0 }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(value);
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => save(value)}
          disabled={saving}
          placeholder={phone}
          style={{
            fontSize: 'inherit',
            fontWeight: 'inherit',
            border: '1px solid var(--accent, #075e54)',
            borderRadius: 4,
            padding: '2px 6px',
            width: '100%',
            maxWidth: 300,
          }}
          autoFocus
        />
      </h3>
    );
  }

  return (
    <h3
      onDoubleClick={handleDoubleClick}
      title="Doble clic para editar"
      style={{ margin: 0, cursor: 'pointer', userSelect: 'none' }}
    >
      {currentName ?? phone}
    </h3>
  );
}
