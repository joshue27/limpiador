'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      setMessage('Si el email está registrado, recibirás un código de 6 dígitos.');
      setStep('code');
    } else {
      setError('Error al enviar el código.');
    }
    setLoading(false);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password }),
    });

    if (res.ok) {
      window.location.assign('/login');
    } else {
      const data = await res.json() as { error?: string };
      setError(data.error || 'Error al restablecer.');
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/brand-logo.png" alt="Logo" className="login-logo" />
        <h1 style={{ margin: '12px 0 4px', fontSize: '1.5rem', color: 'var(--accent, #075e54)' }}>
          {step === 'email' ? 'Recuperar contraseña' : 'Nueva contraseña'}
        </h1>

        {step === 'email' ? (
          <form className="stack" onSubmit={handleSendCode} autoComplete="off">
            <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              Ingresá tu email y te enviaremos un código para restablecer tu contraseña.
            </p>
            <label>
              Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </label>
            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
            {message && <p style={{ color: '#166534', fontSize: '0.85rem' }}>{message}</p>}
            <button type="submit" disabled={loading}>{loading ? 'Enviando…' : 'Enviar código'}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={handleReset} autoComplete="off">
            <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              Ingresá el código de 6 dígitos y tu nueva contraseña.
            </p>
            <label>
              Código
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
                style={{ fontSize: '1.3rem', textAlign: 'center', letterSpacing: '6px' }}
              />
            </label>
            <label>
              Nueva contraseña
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required placeholder="Mínimo 8 caracteres" />
            </label>
            {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6}>{loading ? 'Restableciendo…' : 'Restablecer'}</button>
            <button type="button" className="button-secondary" onClick={() => setStep('email')}>Volver</button>
          </form>
        )}

        <div style={{ marginTop: 12 }}>
          <Link href="/login" style={{ fontSize: '0.85rem', color: 'var(--accent, #075e54)' }}>← Volver al inicio de sesión</Link>
        </div>
      </div>
    </div>
  );
}
