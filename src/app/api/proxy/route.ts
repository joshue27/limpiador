import { NextResponse } from 'next/server';

import { normalizeAllowedOrigins, validateProxyTargetUrl } from '@/lib/proxy-security';
import { getVerifiedSession } from '@/modules/auth/guards';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getVerifiedSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get('url');

  if (!target) {
    return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
  }

  const validation = await validateProxyTargetUrl(target, {
    allowedOrigins: normalizeAllowedOrigins(process.env.PROXY_ALLOWED_ORIGINS),
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  try {
    const response = await fetch(validation.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es',
      },
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return NextResponse.json({ error: 'Redirección inválida' }, { status: 502 });
      const redirectTarget = new URL(location, validation.url);
      const redirectValidation = await validateProxyTargetUrl(redirectTarget.toString(), {
        allowedOrigins: normalizeAllowedOrigins(process.env.PROXY_ALLOWED_ORIGINS),
      });
      if (!redirectValidation.ok) {
        return NextResponse.json({ error: redirectValidation.error }, { status: redirectValidation.status });
      }
      return NextResponse.redirect(`/api/proxy?url=${encodeURIComponent(redirectValidation.url.toString())}`, 307);
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    let body = await response.text();

    // Rewrite relative URLs to go through our proxy
    const proxyBase = `/api/proxy?url=`;
    const targetOrigin = validation.url.origin;

    // Rewrite action/src/href attributes that are relative or same-origin
    body = body.replace(/(src|href|action)=["'](?!https?:\/\/|data:|#|javascript:)([^"']*)["']/gi,
      (_, attr, path) => {
        const absolute = path.startsWith('/') ? targetOrigin + path : validation.url.toString() + '/' + path;
        return `${attr}="${proxyBase}${encodeURIComponent(absolute)}"`;
      }
    );

    // Also rewrite form actions
    body = body.replace(/(<form[^>]*?action=)["']([^"']*)["']/gi,
      (_, prefix, action) => {
        if (action.startsWith('http')) {
          return `${prefix}"${proxyBase}${encodeURIComponent(action)}"`;
        }
        return `${prefix}"${proxyBase}${encodeURIComponent(targetOrigin + (action.startsWith('/') ? '' : '/') + action)}"`;
      }
    );

    // Remove X-Frame-Options and CSP frame-ancestors
    const headers = new Headers();
    headers.set('Content-Type', contentType);

    return new Response(body, { headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
