'use client';

import { useState } from 'react';

type TagPillSelectorProps = {
  name: string;
  tags: Array<{ id: string; code: string; name: string }>;
  selected: string[];
  compact?: boolean;
};

export function TagPillSelector({ name, tags, selected, compact }: TagPillSelectorProps) {
  const [selectedSet, setSelectedSet] = useState(new Set(selected));

  function toggle(code: string) {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  return (
    <div className={`tag-pill-selector${compact ? ' tag-pill-selector-compact' : ''}`}>
      {tags.length ? tags.map((tag) => (
        <label key={tag.id} className={`tag-pill-option${selectedSet.has(tag.code) ? ' tag-pill-selected' : ''}`}>
          <input
            type="checkbox"
            name={name}
            value={tag.code}
            checked={selectedSet.has(tag.code)}
            onChange={() => toggle(tag.code)}
          />
          {tag.name}
        </label>
      )) : <small>Sin etiquetas activas.</small>}
    </div>
  );
}
