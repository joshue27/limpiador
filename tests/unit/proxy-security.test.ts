import { describe, expect, it } from 'vitest';

import {
  isPrivateIpAddress,
  normalizeAllowedOrigins,
  validateProxyTargetUrl,
} from '@/lib/proxy-security';

describe('proxy security', () => {
  it('normalizes explicit allowed origins and rejects unlisted public targets', async () => {
    const allowedOrigins = normalizeAllowedOrigins(
      'https://docs.example.test, https://cdn.example.test/path',
    );
    const lookup = async () => [{ address: '93.184.216.34' }];

    await expect(
      validateProxyTargetUrl('https://docs.example.test/help', { allowedOrigins, lookup }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      validateProxyTargetUrl('https://evil.example.test/help', { allowedOrigins }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'Origen no permitido',
    });
  });

  it('blocks localhost and private-network targets before proxying', async () => {
    expect(isPrivateIpAddress('127.0.0.1')).toBe(true);
    expect(isPrivateIpAddress('10.10.10.10')).toBe(true);
    expect(isPrivateIpAddress('172.16.0.5')).toBe(true);
    expect(isPrivateIpAddress('192.168.1.50')).toBe(true);
    expect(isPrivateIpAddress('8.8.8.8')).toBe(false);

    await expect(validateProxyTargetUrl('http://127.0.0.1:3000/admin')).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'URL privada no permitida',
    });
  });

  it('blocks bracketed IPv6 loopback, mapped loopback, ULA, and link-local literals', async () => {
    expect(isPrivateIpAddress('[::1]')).toBe(true);
    expect(isPrivateIpAddress('[::ffff:127.0.0.1]')).toBe(true);
    expect(isPrivateIpAddress('[fc00::1]')).toBe(true);
    expect(isPrivateIpAddress('[fd00::1]')).toBe(true);
    expect(isPrivateIpAddress('[fe80::1]')).toBe(true);
    expect(isPrivateIpAddress('[fe90::1]')).toBe(true);
    expect(isPrivateIpAddress('[2001:4860:4860::8888]')).toBe(false);

    for (const target of [
      'http://[::1]/admin',
      'http://[::ffff:127.0.0.1]/admin',
      'http://[fe80::1]/admin',
      'http://[fe90::1]/admin',
    ]) {
      await expect(validateProxyTargetUrl(target)).resolves.toEqual({
        ok: false,
        status: 400,
        error: 'URL privada no permitida',
      });
    }
  });

  it('blocks DNS names that resolve to private addresses', async () => {
    const lookup = async () => [{ address: '192.168.1.20' }];

    await expect(
      validateProxyTargetUrl('https://internal.example.test', { lookup }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'URL privada no permitida',
    });
  });

  it('fails closed when DNS verification cannot resolve a hostname', async () => {
    const lookup = async () => {
      throw new Error('dns timeout');
    };

    await expect(
      validateProxyTargetUrl('https://cdn.example.test/assets/logo.png', { lookup }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'No se pudo verificar el destino',
    });
  });
});
