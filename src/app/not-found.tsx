import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="es">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: '1rem',
          }}
        >
          <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
          <p>Página no encontrada.</p>
          <Link href="/login" style={{ marginTop: '1rem', color: '#0070f3' }}>
            Volver al inicio
          </Link>
        </div>
      </body>
    </html>
  );
}
