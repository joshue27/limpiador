'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback } from 'react';

export function ContactSearch({ currentQuery }: { currentQuery: string }) {
  const router = useRouter();

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const query = (formData.get('q') as string)?.trim() ?? '';
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      router.replace(`/contacts${params.toString() ? `?${params}` : ''}`);
    },
    [router],
  );

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input name="q" placeholder="Buscar por nombre, teléfono o etiqueta" defaultValue={currentQuery} />
      <button type="submit">Buscar</button>
    </form>
  );
}
