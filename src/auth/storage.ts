import type { AuthSession, AuthTokens, AuthUser, SonaraConfig } from '../types';

export const DEFAULT_BACKEND_URL = 'https://nodes-oz1k.onrender.com';

/**
 * Pre-Render development origins. `tp_backend_url` is persisted on every
 * successful login, so installs created before the hosted backend shipped are
 * still pinned to localhost. `repointStoredBackendUrl` rewrites exactly these.
 */
const LEGACY_LOCAL_BACKEND_URLS = ['http://localhost:5000', 'http://127.0.0.1:5000'];

/**
 * Point installs still pinned at a local dev origin at the hosted backend.
 * Only localhost variants are touched: any other stored URL was chosen on
 * purpose (staging, a fork, a self-hosted box) and is left alone.
 */
export async function repointStoredBackendUrl(): Promise<void> {
  const result = await storageGet([STORAGE_KEYS.backendUrl]);
  const current = result[STORAGE_KEYS.backendUrl];
  if (typeof current !== 'string') return;

  const clean = current.replace(/\/+$/, '');
  if (!LEGACY_LOCAL_BACKEND_URLS.includes(clean)) return;
  if (clean === DEFAULT_BACKEND_URL) return;

  await storageSet({ [STORAGE_KEYS.backendUrl]: DEFAULT_BACKEND_URL });
}

const STORAGE_KEYS = {
  accessToken: 'tp_access_token',
  refreshToken: 'tp_refresh_token',
  expiresAt: 'tp_token_expires_at',
  backendUrl: 'tp_backend_url',
  user: 'tp_user',
  session: 'tp_session',
  // legacy keys to clear on migrate
  legacyApiKey: 'sonaraApiKey',
  legacyBackendUrl: 'sonaraBackendUrl',
  legacyIdentity: 'sonaraIdentity',
} as const;

export type StoredAuthState = {
  tokens: AuthTokens | null;
  user: AuthUser | null;
  session: AuthSession | null;
  backendUrl: string;
};

function storageGet<T extends string>(keys: T[]): Promise<Record<T, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result as Record<T, unknown>));
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

/**
 * Migrate any legacy API-key-era storage into the session-based shape.
 * Copies an old backend URL if no modern one exists yet, then drops legacy keys.
 * Also repoints installs still pinned at a local dev origin at the hosted backend.
 * Safe to call on install and on every browser startup.
 */
export async function migrateLegacyStorage(): Promise<void> {
  const result = await storageGet([STORAGE_KEYS.backendUrl, STORAGE_KEYS.legacyBackendUrl]);
  if (!result[STORAGE_KEYS.backendUrl] && typeof result[STORAGE_KEYS.legacyBackendUrl] === 'string') {
    const url = String(result[STORAGE_KEYS.legacyBackendUrl]).replace(/\/+$/, '');
    if (url) await storageSet({ [STORAGE_KEYS.backendUrl]: url });
  }
  await storageRemove([STORAGE_KEYS.legacyApiKey, STORAGE_KEYS.legacyIdentity, STORAGE_KEYS.legacyBackendUrl]);
  await repointStoredBackendUrl();
}

export async function getBackendUrl(): Promise<string> {
  const result = await storageGet([STORAGE_KEYS.backendUrl, STORAGE_KEYS.legacyBackendUrl]);
  const url =
    (typeof result[STORAGE_KEYS.backendUrl] === 'string' && result[STORAGE_KEYS.backendUrl]) ||
    (typeof result[STORAGE_KEYS.legacyBackendUrl] === 'string' && result[STORAGE_KEYS.legacyBackendUrl]) ||
    DEFAULT_BACKEND_URL;
  return String(url).replace(/\/+$/, '');
}

export async function setBackendUrl(backendUrl: string): Promise<string> {
  const clean = (backendUrl.trim() || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  await storageSet({ [STORAGE_KEYS.backendUrl]: clean });
  return clean;
}

export async function loadAuthState(): Promise<StoredAuthState> {
  const result = await storageGet([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.backendUrl,
    STORAGE_KEYS.user,
    STORAGE_KEYS.session,
    STORAGE_KEYS.legacyBackendUrl,
  ]);

  const accessToken = typeof result[STORAGE_KEYS.accessToken] === 'string' ? (result[STORAGE_KEYS.accessToken] as string) : '';
  const refreshToken = typeof result[STORAGE_KEYS.refreshToken] === 'string' ? (result[STORAGE_KEYS.refreshToken] as string) : '';
  const expiresAt = typeof result[STORAGE_KEYS.expiresAt] === 'string' ? (result[STORAGE_KEYS.expiresAt] as string) : '';
  const backendUrl = await getBackendUrl();

  const tokens: AuthTokens | null =
    accessToken && refreshToken
      ? {
          accessToken,
          refreshToken,
          expiresAt: expiresAt || new Date().toISOString(),
          expiresIn: 900,
        }
      : null;

  return {
    tokens,
    user: (result[STORAGE_KEYS.user] as AuthUser) || null,
    session: (result[STORAGE_KEYS.session] as AuthSession) || null,
    backendUrl,
  };
}

export async function saveAuthState(input: {
  tokens: AuthTokens;
  user: AuthUser;
  session: AuthSession;
  backendUrl?: string;
}): Promise<void> {
  const backendUrl = input.backendUrl
    ? input.backendUrl.replace(/\/+$/, '')
    : await getBackendUrl();

  await storageSet({
    [STORAGE_KEYS.accessToken]: input.tokens.accessToken,
    [STORAGE_KEYS.refreshToken]: input.tokens.refreshToken,
    [STORAGE_KEYS.expiresAt]: input.tokens.expiresAt,
    [STORAGE_KEYS.user]: input.user,
    [STORAGE_KEYS.session]: input.session,
    [STORAGE_KEYS.backendUrl]: backendUrl,
  });

  // Drop legacy API-key storage
  await storageRemove([
    STORAGE_KEYS.legacyApiKey,
    STORAGE_KEYS.legacyIdentity,
  ]);
}

export async function clearAuthState(): Promise<void> {
  await storageRemove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.expiresAt,
    STORAGE_KEYS.user,
    STORAGE_KEYS.session,
    STORAGE_KEYS.legacyApiKey,
    STORAGE_KEYS.legacyIdentity,
  ]);
}

export async function getSonaraConfig(): Promise<SonaraConfig> {
  const state = await loadAuthState();
  return {
    backendUrl: state.backendUrl,
    authenticated: Boolean(state.tokens),
    user: state.user,
    session: state.session,
  };
}

export function isAccessTokenExpired(expiresAt: string, skewMs = 60_000): boolean {
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return true;
  return Date.now() >= expiry - skewMs;
}
