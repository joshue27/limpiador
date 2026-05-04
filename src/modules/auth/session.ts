import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_TTL_SECONDS = parseInt(process.env.SESSION_TTL_SECONDS || '604800', 10);
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'limpiador_session';

export type SessionRole = 'ADMIN' | 'OPERATOR';

export type AppSession = {
  userId: string;
  email: string;
  name: string | null;
  role: SessionRole;
  permissions?: Record<string, boolean>;
};

function secretKey() {
  return new TextEncoder().encode(SESSION_SECRET);
}

export async function createSessionToken(session: AppSession) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<AppSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      (payload.role !== 'ADMIN' && payload.role !== 'OPERATOR')
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: AppSession) {
  const token = await createSessionToken(session);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}
