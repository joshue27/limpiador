'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';

export function SoftForm({ action, method = 'post', children, className, style }: {
  action: string;
  method?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    await fetch(action, { method, body: fd });
    router.refresh();
  }

  return (
    <form action={action} method={method} className={className} style={style} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
