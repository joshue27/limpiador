import Link from 'next/link';

import type { AppSession } from '@/modules/auth/session';

const navItems = [
  { href: '/dashboard', label: 'Resumen', icon: '📊', key: 'dashboard' },
  { href: '/inbox', label: 'Conversaciones', icon: '💬', key: 'inbox' },
  { href: '/chat', label: 'Chat interno', icon: '💭', key: 'chat' },
  { href: '/contacts', label: 'Contactos', icon: '👥', key: 'contacts' },
  { href: '/templates', label: 'Plantillas', icon: '📋', key: 'templates' },
  { href: '/campaigns', label: 'Campañas', icon: '📢', key: 'campaigns' },
  { href: '/comprobantes', label: 'Archivados', icon: '📎', key: 'comprobantes' },
  { href: '/exports', label: 'Exportaciones', icon: '📦', key: 'exports' },
  { href: '/audit', label: 'Auditoría', icon: '🔍', key: 'audit' },
  { href: '/settings', label: 'Configuración', icon: '⚙️', key: 'settings' },
];

export function AppShell({ children, session, sidebarColor }: { children: React.ReactNode; session: AppSession; sidebarColor?: string | null }) {
  const isAdmin = session.role === 'ADMIN';
  const perms = session.permissions ?? {};

  const visibleItems = navItems.filter((item) => {
    if (isAdmin) return true;
    if (item.key === 'settings') return true;
    return perms[item.key] === true;
  });

  return (
    <div className="app-shell">
      <aside className="sidebar" style={sidebarColor ? { background: sidebarColor } : undefined}>
        <div>
          <img src="/brand-logo.png" alt="Logo" className="sidebar-logo" />
          <p className="eyebrow">CleanApp</p>
          <h1>Gestión de WhatsApp</h1>
        </div>
        <nav className="nav-list" aria-label="Principal">
          {visibleItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <span style={{ marginRight: 6 }}>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div>
            <strong>{session.name || session.email}</strong>
            <span>{session.role}</span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="button-secondary" type="submit">
              Salir
            </button>
          </form>
        </header>
        <main className="page-shell">{children}</main>
      </div>
    </div>
  );
}
