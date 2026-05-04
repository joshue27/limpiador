'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

type Props = {
  conversationId: string;
  filters: Record<string, string>;
  chatQuery: string;
  total: number;
  activeMatchIndex: number;
  hasMatches: boolean;
};

export function ChatSearchForm({ conversationId, filters, chatQuery, total, activeMatchIndex, hasMatches }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value when chatQuery changes from outside (e.g. clear)
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== chatQuery) {
      inputRef.current.value = chatQuery;
    }
  }, [chatQuery]);

  function navigate(params: Record<string, string | number>) {
    const searchParams = new URLSearchParams();
    searchParams.set('conversation', conversationId);
    for (const [key, value] of Object.entries(filters)) {
      if (value) searchParams.set(key, value);
    }
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, String(value));
    }
    router.push(`/inbox?${searchParams.toString()}`, { scroll: false });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate({ chatSearch: inputRef.current?.value ?? '' });
  }

  function handlePrev() {
    navigate({ chatSearch: chatQuery, chatMatch: activeMatchIndex - 1 });
  }

  function handleNext() {
    navigate({ chatSearch: chatQuery, chatMatch: activeMatchIndex + 1 });
  }

  function handleClear() {
    const searchParams = new URLSearchParams();
    searchParams.set('conversation', conversationId);
    for (const [key, value] of Object.entries(filters)) {
      if (value) searchParams.set(key, value);
    }
    router.push(`/inbox?${searchParams.toString()}`, { scroll: false });
    // Scroll to newest message after clearing search
    setTimeout(() => {
      const container = document.querySelector('.message-history .messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 200);
  }

  return (
    <form onSubmit={handleSubmit} className="conversation-search conversation-search-inline" aria-label="Buscar dentro de la conversación">
      <div className="conversation-search-row compact">
        <label className="conversation-search-input">
          <span className="sr-only">Buscar en este chat</span>
          <input ref={inputRef} name="chatSearch" defaultValue={chatQuery} placeholder="Buscar en este chat…" />
        </label>
        <button type="submit" className="compact-icon-button" aria-label="Buscar en este chat">🔎</button>
        <button type="button" className="compact-icon-button" onClick={handlePrev} disabled={!hasMatches || total <= 1} aria-label="Coincidencia anterior">⬅️</button>
        <button type="button" className="compact-icon-button" onClick={handleNext} disabled={!hasMatches || total <= 1} aria-label="Coincidencia siguiente">➡️</button>
        <button type="button" className="button-link-secondary compact-icon-button" onClick={handleClear} aria-label="Limpiar búsqueda">❌</button>
        <small className="conversation-search-count">
          {chatQuery
            ? `${activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0}/${total}`
            : '0/0'}
        </small>
      </div>
    </form>
  );
}
