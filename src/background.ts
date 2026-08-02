import type { AuthSession, AuthTokens, AuthUser, BackgroundMessage, BackgroundResponse, TweetData } from './types';
import {
  clearAuthState,
  getBackendUrl,
  getSonaraConfig,
  isAccessTokenExpired,
  loadAuthState,
  migrateLegacyStorage,
  saveAuthState,
  setBackendUrl,
} from './auth/storage';
import type { SonaraConfig } from './types';

type AuthApiPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  expiresIn: number;
  session: AuthSession;
  user: AuthUser & {
    profile?: AuthUser['profile'];
  };
};

let refreshInFlight: Promise<AuthTokens | null> | null = null;

const REFRESH_ALARM_NAME = 'session-refresh';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const REFRESH_CHECK_PERIOD_MINUTES = 5;

function apiError(error: string, code?: string): BackgroundResponse {
  return { success: false, error, code };
}

async function parseJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function login(email: string, password: string, backendUrl?: string): Promise<BackgroundResponse> {
  const baseUrl = backendUrl ? await setBackendUrl(backendUrl) : await getBackendUrl();

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      clientType: 'extension',
      deviceName: 'Chrome Extension',
    }),
  });

  const body = await parseJson(response);

  if (!response.ok) {
    return apiError(body?.error?.message || 'Login failed', body?.error?.code);
  }

  const data = body.data as AuthApiPayload;
  await persistAuthPayload(data, baseUrl);
  const config = await getSonaraConfig();
  return { success: true, config, authenticated: true };
}

async function persistAuthPayload(data: AuthApiPayload, backendUrl?: string): Promise<void> {
  const tokens: AuthTokens = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : new Date(data.expiresAt).toISOString(),
    expiresIn: data.expiresIn,
  };

  const user: AuthUser = {
    id: data.user.id,
    email: data.user.email,
    isActive: data.user.isActive,
    profile: data.user.profile
      ? {
          firstName: data.user.profile.firstName ?? null,
          lastName: data.user.profile.lastName ?? null,
          avatarUrl: data.user.profile.avatarUrl ?? null,
        }
      : undefined,
  };

  const session: AuthSession = {
    id: data.session.id,
    jti: data.session.jti,
    clientType: data.session.clientType,
    deviceName: data.session.deviceName,
    expiresAt:
      typeof data.session.expiresAt === 'string'
        ? data.session.expiresAt
        : new Date(data.session.expiresAt).toISOString(),
  };

  await saveAuthState({ tokens, user, session, backendUrl });
  maintainRefreshAlarm(true);
}

async function refreshTokens(): Promise<AuthTokens | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const state = await loadAuthState();
    if (!state.tokens?.refreshToken) return null;

    try {
      const response = await fetch(`${state.backendUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.tokens.refreshToken }),
      });

      const body = await parseJson(response);
      if (!response.ok) {
        // Only clear session if backend explicitly rejected refresh token with 401/403
        if (response.status === 401 || response.status === 403) {
          await clearAuthState();
        }
        return null;
      }

      const data = body.data as AuthApiPayload;
      await persistAuthPayload(data, state.backendUrl);
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : new Date(data.expiresAt).toISOString(),
        expiresIn: data.expiresIn,
      };
    } catch {
      // Connection or network error — preserve stored credentials
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const state = await loadAuthState();
  if (!state.tokens?.refreshToken) return null;

  if (!isAccessTokenExpired(state.tokens.expiresAt)) {
    return state.tokens.accessToken;
  }

  try {
    const refreshed = await refreshTokens();
    return refreshed?.accessToken ?? state.tokens.accessToken;
  } catch {
    return state.tokens.accessToken;
  }
}

type SessionStatus = 'authenticated' | 'unauthenticated' | 'offline';

async function recoverSession(): Promise<SessionStatus> {
  const state = await loadAuthState();
  if (!state.tokens?.refreshToken) return 'unauthenticated';

  if (!isAccessTokenExpired(state.tokens.expiresAt)) {
    return 'authenticated';
  }

  try {
    const refreshed = await refreshTokens();
    if (refreshed) return 'authenticated';
    
    // Check if tokens were explicitly cleared by a 401/403
    const currentState = await loadAuthState();
    if (!currentState.tokens?.refreshToken) return 'unauthenticated';
    return 'offline';
  } catch {
    return 'offline';
  }
}

async function getSessionConfig(): Promise<SonaraConfig> {
  const status = await recoverSession();
  if (status === 'unauthenticated') {
    await clearAuthState();
    maintainRefreshAlarm(false);
  }
  const config = await getSonaraConfig();
  if (config.authenticated) maintainRefreshAlarm(true);
  return config;
}

/**
 * Proactive session maintenance. Keeps a low-frequency alarm armed while a
 * session exists so the access token is refreshed just before it expires,
 * preventing the first protected call after idle time from incurring a 401.
 */
function maintainRefreshAlarm(active: boolean): void {
  if (typeof chrome.alarms === 'undefined') return;
  if (!active) {
    void chrome.alarms.clear(REFRESH_ALARM_NAME);
    return;
  }
  chrome.alarms.get(REFRESH_ALARM_NAME, (existing) => {
    if (existing) return;
    chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: REFRESH_CHECK_PERIOD_MINUTES });
  });
}

async function refreshFromAlarm(): Promise<void> {
  const state = await loadAuthState();
  if (!state.tokens) {
    maintainRefreshAlarm(false);
    return;
  }
  const msUntilExpiry = Date.parse(state.tokens.expiresAt) - Date.now();
  if (!Number.isNaN(msUntilExpiry) && msUntilExpiry > REFRESH_MARGIN_MS) return;

  try {
    await refreshTokens();
  } catch {
    // Best-effort foreground refresh; failures are handled on the next request.
  }
}

async function logout(): Promise<BackgroundResponse> {
  const state = await loadAuthState();
  const accessToken = state.tokens?.accessToken;

  if (accessToken) {
    try {
      await fetch(`${state.backendUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      // Local logout still proceeds
    }
  }

  await clearAuthState();
  maintainRefreshAlarm(false);
  return { success: true, authenticated: false, config: await getSonaraConfig() };
}

async function authenticatedFetch(path: string, method = 'GET', body?: unknown, retried = false): Promise<Response> {
  const backendUrl = await getBackendUrl();
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw Object.assign(new Error('Not authenticated'), { code: 'UNAUTHENTICATED' });
  }

  const response = await fetch(`${backendUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !retried) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return authenticatedFetch(path, method, body, true);
    }
  }

  return response;
}

function mapTweetToSavePayload(tweet: TweetData) {
  const safeHandle = (username: string | undefined, fallback = 'unknown'): string => {
    const base = (username || '').trim().replace(/^@+/, '');
    const clean = base.replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
    return clean ? `@${clean}` : `@${fallback}`;
  };

  const handle = safeHandle(tweet.author?.username);
  const displayName = (tweet.author?.display_name || handle).trim().slice(0, 100) || 'Unnamed user';
  const text = (tweet.content?.text || '').trim();
  const sourceUrl = tweet.url;
  const mediaUrls = Array.isArray(tweet.content?.media)
    ? (tweet.content.media as string[]).filter((m): m is string => typeof m === 'string' && /^https?:\/\//.test(m))
    : [];
  const avatarUrl = tweet.author?.avatar_url;
  const authorAvatarUrl = typeof avatarUrl === 'string' && /^https?:\/\//.test(avatarUrl) ? avatarUrl : undefined;
  const safeText = (text || sourceUrl).slice(0, 10000);

  return {
    tweetId: tweet.id,
    text: safeText,
    authorHandle: handle,
    authorName: displayName,
    authorAvatarUrl,
    sourceUrl,
    mediaUrls,
    metricsLikes: tweet.metrics?.likes || 0,
    metricsRetweets: tweet.metrics?.retweets || 0,
    metricsReplies: tweet.metrics?.replies || 0,
    isThread: Boolean(tweet.context?.is_reply || tweet.context?.is_quote),
    rawMetadata: {
      captured_at: tweet.captured_at,
      context: tweet.context,
      initial_tags: tweet.initial_tags,
      collector_note: tweet.collector_note,
    },
  };
}

async function saveContent(tweet: TweetData): Promise<BackgroundResponse> {
  try {
    const response = await authenticatedFetch('/api/extension/save-content', 'POST', mapTweetToSavePayload(tweet));
    const body = await parseJson(response);

    if (!response.ok) {
      return apiError(body?.error?.message || `Backend error (${response.status})`, body?.error?.code);
    }

    return {
      success: true,
      data: body.data,
    };
  } catch (err: any) {
    return apiError(err?.message || 'Network request failed', err?.code);
  }
}

async function handleMessage(message: BackgroundMessage): Promise<BackgroundResponse> {
  switch (message.action) {
    case 'AUTH_LOGIN':
      return login(message.email, message.password, message.backendUrl);
    case 'AUTH_LOGOUT':
      return logout();
    case 'AUTH_STATUS':
    case 'AUTH_GET_CONFIG': {
      const config = await getSessionConfig();
      return { success: true, config, authenticated: config.authenticated };
    }
    case 'SET_BACKEND_URL': {
      await setBackendUrl(message.backendUrl);
      return { success: true, config: await getSonaraConfig() };
    }
    case 'API_SAVE_CONTENT':
      return saveContent(message.tweet);
    case 'API_FETCH': {
      try {
        const response = await authenticatedFetch(message.path, message.method || 'GET', message.body);
        const data = await parseJson(response);
        if (!response.ok) {
          return apiError(data?.error?.message || `Request failed (${response.status})`, data?.error?.code);
        }
        return { success: true, data };
      } catch (err: any) {
        return apiError(err?.message || 'Request failed', err?.code);
      }
    }
    case 'TWEETS_UPDATED':
      return { success: true };
    default:
      return apiError('Unknown action');
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse(apiError(err?.message || 'Unexpected error')));
  return true;
});

/**
 * Opening the extension action toggles the Sonara side panel.
 * No default_popup is set — that would block this and show a toolbar popup instead.
 */
function enableSidePanel(): void {
  if (typeof chrome.sidePanel === 'undefined') return;

  chrome.sidePanel
    .setOptions({ path: 'sidepanel.html', enabled: true })
    .catch((err: unknown) => console.warn('Side panel options:', (err as Error)?.message || err));

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => console.warn('Side panel behavior:', (err as Error)?.message || err));
}

async function openSidePanelForTab(tab?: chrome.tabs.Tab): Promise<void> {
  if (typeof chrome.sidePanel === 'undefined') return;
  try {
    const windowId = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    if (typeof windowId === 'number') {
      await chrome.sidePanel.open({ windowId });
    }
  } catch (err) {
    console.warn('Side panel open:', (err as Error)?.message || err);
  }
}

// Ensure behavior is set whenever the service worker wakes up.
enableSidePanel();

// Fires when there is no default_popup — opens the side panel on icon click.
chrome.action.onClicked.addListener((tab) => {
  void openSidePanelForTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanel();
  void migrateLegacyStorage().then(() => getBackendUrl());
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanel();
  void migrateLegacyStorage().then(() => getSessionConfig());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    void refreshFromAlarm();
  }
});
