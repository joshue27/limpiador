import { NextResponse, type NextRequest } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

import { verifySessionToken } from '@/modules/auth/session';

const PUBLIC_PATHS = [
  '/login',
  '/verify',
  '/forgot',
  '/privacy',
  '/api/health',
  '/api/auth/login',
  '/api/auth/verify',
  '/api/auth/forgot',
  '/api/auth/reset',
  '/api/dev/bootstrap-admin',
  '/api/webhooks/whatsapp',
  '/brand-logo.png',
  '/login-bg.jpg',
  '/favicon.ico',
  '/notification-message.mp3',
  '/notification-transfer.mp3',
  '/plantilla_contactos.csv',
];
const AUTH_IN_ROUTE_PATHS = ['/api/exports/restore'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAuthHandledInRoute(pathname: string) {
  return AUTH_IN_ROUTE_PATHS.includes(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname) || isAuthHandledInRoute(pathname)) {
    return NextResponse.next();
  }

  const cookieName = process.env.SESSION_COOKIE_NAME || 'limpiador_session';
  const token = request.cookies.get(cookieName)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(safeRedirect(request, '/forbidden'));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
