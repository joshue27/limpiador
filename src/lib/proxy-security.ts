import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

type LookupResult = { address: string };
type Lookup = (hostname: string) => Promise<LookupResult[]>;

type ProxyValidationOptions = {
  allowedOrigins?: Set<string>;
  lookup?: Lookup;
};

export type ProxyValidationResult =
  | { ok: true; url: URL }
  | { ok: false; status: 400 | 403; error: string };

export function normalizeAllowedOrigins(value: string | undefined | null): Set<string> {
  const origins = new Set<string>();
  for (const raw of (value ?? '').split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed allowlist entries so one typo does not open the proxy.
    }
  }
  return origins;
}

export function isPrivateIpAddress(address: string): boolean {
  const canonical = canonicalizeIpLiteral(address);
  if (net.isIP(canonical) === 4) {
    return isPrivateIpv4Address(canonical);
  }

  if (net.isIP(canonical) === 6) {
    const normalized = canonical.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;

    const mappedIpv4 =
      normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] ??
      ipv4FromHexMappedIpv6(normalized);
    if (mappedIpv4 && net.isIP(mappedIpv4) === 4) return isPrivateIpv4Address(mappedIpv4);

    const firstSegment = Number.parseInt(normalized.split(':')[0] ?? '', 16);
    if (!Number.isFinite(firstSegment)) return false;

    return (firstSegment & 0xfe00) === 0xfc00 || (firstSegment & 0xffc0) === 0xfe80;
  }

  return false;
}

function canonicalizeIpLiteral(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
}

function isPrivateIpv4Address(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first === 0
  );
}

function ipv4FromHexMappedIpv6(address: string): string | undefined {
  const match = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!match) return undefined;

  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return undefined;

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

export async function validateProxyTargetUrl(
  target: string,
  options: ProxyValidationOptions = {},
): Promise<ProxyValidationResult> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, status: 400, error: 'URL inválida' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'URL inválida' };
  }

  if (
    options.allowedOrigins &&
    options.allowedOrigins.size > 0 &&
    !options.allowedOrigins.has(url.origin)
  ) {
    return { ok: false, status: 403, error: 'Origen no permitido' };
  }

  const hostname = canonicalizeIpLiteral(url.hostname);

  if (isPrivateIpAddress(hostname)) {
    return { ok: false, status: 400, error: 'URL privada no permitida' };
  }

  const lookup = options.lookup ?? defaultLookup;
  let addresses: LookupResult[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return { ok: false, status: 400, error: 'No se pudo verificar el destino' };
  }
  if (addresses.some((result) => isPrivateIpAddress(result.address))) {
    return { ok: false, status: 400, error: 'URL privada no permitida' };
  }

  return { ok: true, url };
}

async function defaultLookup(hostname: string): Promise<LookupResult[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}
