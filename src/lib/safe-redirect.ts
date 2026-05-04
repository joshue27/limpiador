/** Build a redirect URL that respects the X-Forwarded-Host header (Cloudflare Tunnel, proxies). */
export function safeRedirect(request: Request, path: string): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    const proto = forwardedProto === 'https' ? 'https' : 'http';
    return `${proto}://${forwardedHost}${path}`;
  }
  // Fall back to the request URL (works for direct localhost access)
  return new URL(path, request.url).toString();
}
