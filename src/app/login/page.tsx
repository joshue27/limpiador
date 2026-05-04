import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <LoginForm />
        <div style={{ marginTop: 16, fontSize: '0.75rem' }}>
          <a href="/privacy" style={{ color: '#9ca3af' }}>Política de Privacidad</a>
        </div>
      </div>
    </div>
  );
}
