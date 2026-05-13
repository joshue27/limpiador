'use client';

import { useEffect, useState } from 'react';

export function VerifyForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get('email') || '');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });

    if (res.ok) {
      window.location.assign('/inbox');
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error || 'Error al verificar');
    }

    setLoading(false);
  }

  return (
    <>
      <img src="/brand-logo.png" alt="Logo" className="login-logo" />
      <h1 style={{ margin: '12px 0 4px', fontSize: '1.5rem', color: 'var(--accent, #075e54)' }}>
        Verificación
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 16 }}>
        Te enviamos un código de 6 dígitos a <strong>{email}</strong>.
      </p>
      <form className="stack" onSubmit={handleSubmit} autoComplete="off">
        <label>
          Código de verificación
          <input
            name="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
            required
            style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '8px' }}
          />
        </label>
        {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
        <button type="submit" disabled={loading || code.length !== 6}>
          {loading ? 'Verificando…' : 'Verificar'}
        </button>
      </form>
    </>
  );
}
