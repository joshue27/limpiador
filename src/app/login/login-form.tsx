'use client';

import { useState, type FormEvent } from 'react';

import { sha256 } from '@/shared/crypto';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;

    const hash = await sha256(password);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, hash, password }),
    });

    if (!response.ok) {
      setError(response.status === 429 ? 'Demasiados intentos. Intente de nuevo en unos minutos.' : 'No fue posible iniciar sesión con esos datos.');
      return;
    }

    const data = await response.json().catch(() => ({})) as { ok?: boolean; verifyRequired?: boolean };
    if (data.verifyRequired) {
      window.location.assign(`/verify?email=${encodeURIComponent(email)}`);
      return;
    }

    window.location.assign('/inbox');
  }

  return (
    <div className="login-layout">
      <div className="login-brand-panel">
        <img src="/brand-logo.png" alt="Logo" className="login-logo" />
        <h1>CleanApp</h1>
        <p>WhatsApp Cloud Management</p>
      </div>

      <form className="stack login-form" onSubmit={onSubmit} autoComplete="off">
        <label>
          Email
          <input name="email" type="email" autoComplete="username" autoCapitalize="none" placeholder="correo@empresa.com" required />
        </label>
        <label>
          Contraseña
          <div style={{ position: 'relative' }}>
            <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="off" placeholder="••••••••" required style={{ width: '100%', paddingRight: 55 }} />
            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                cursor: 'pointer', fontSize: '0.7rem', color: '#9ca3af', userSelect: 'none',
              }}
            >
              {showPassword ? 'ocultar' : 'mostrar'}
            </span>
          </div>
        </label>
        <button type="submit">Entrar</button>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <a href="/forgot" style={{ fontSize: '0.8rem', color: 'var(--accent, #075e54)' }}>¿Olvidaste tu contraseña?</a>
        </div>
      </form>

      <div className="login-error-slot">
        {error ? <p role="alert" className="login-error-message">{error}</p> : null}
      </div>
    </div>
  );
}
