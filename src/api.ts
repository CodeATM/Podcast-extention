import type { BackgroundMessage, BackgroundResponse, SonaraConfig, TweetData, BackendSyncResponse, TweetListResult } from './types';
import { DEFAULT_BACKEND_URL } from './auth/storage';

export { DEFAULT_BACKEND_URL };

/**
 * Sends a message to the extension background context.
 *
 * @param message - The background message to send
 * @returns The background response, or a failed response when the runtime is unavailable, messaging fails, or no response is received
 */
function sendToBackground(message: BackgroundMessage): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve({ success: false, error: 'Extension runtime unavailable' });
      return;
    }

    chrome.runtime.sendMessage(message, (response: BackgroundResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message || 'Messaging failed' });
        return;
      }
      resolve(response || { success: false, error: 'Empty response from background' });
    });
  });
}

/**
 * Retrieves the current Sonara authentication configuration.
 *
 * @returns The configured backend URL and authentication status, or default unauthenticated settings when configuration retrieval fails.
 */
export async function getSonaraConfig(): Promise<SonaraConfig> {
  const response = await sendToBackground({ action: 'AUTH_GET_CONFIG' });
  if (response.success && response.config) {
    return response.config;
  }
  return {
    backendUrl: DEFAULT_BACKEND_URL,
    authenticated: false,
  };
}

/**
 * Authenticates a user with their email address and password.
 *
 * @param email - The user's email address
 * @param password - The user's password
 * @param backendUrl - An optional backend URL
 * @returns The authentication response
 */
export async function login(email: string, password: string, backendUrl?: string): Promise<BackgroundResponse> {
  return sendToBackground({ action: 'AUTH_LOGIN', email, password, backendUrl });
}

/**
 * Logs the current user out of the backend.
 *
 * @returns The authentication logout response.
 */
export async function logout(): Promise<BackgroundResponse> {
  return sendToBackground({ action: 'AUTH_LOGOUT' });
}

/**
 * Synchronizes tweet data with the backend.
 *
 * @param tweetData - The tweet data to synchronize
 * @returns A successful response with the narrative identifier, or a failed response with an error message
 */
export async function syncTweetToBackend(tweetData: TweetData): Promise<BackendSyncResponse> {
  const response = await sendToBackground({ action: 'API_SAVE_CONTENT', tweet: tweetData });
  if (response.success) {
    const data = response.data as { id?: string; tweetId?: string } | undefined;
    return {
      success: true,
      narrativeId: data?.id || data?.tweetId || tweetData.id,
      message: 'Successfully synced to backend',
    };
  }
  return {
    success: false,
    error: response.error || 'Sync failed',
  };
}

/**
 * Loads saved tweets from the backend.
 *
 * @returns The saved tweets and normalized pagination details
 * @throws An error with the backend error code when the request fails
 */
export async function getSavedTweets(): Promise<TweetListResult> {
  const response = await sendToBackground({ action: 'API_FETCH', path: '/api/tweets', method: 'GET' });
  if (!response.success) {
    const err = new Error(response.error || 'Failed to load saved tweets');
    (err as { code?: string }).code = response.code;
    throw err;
  }

  // Backend may return `{ data: { items, pagination } }` or a flat `{ items, pagination }`.
  const body = (response.data ?? {}) as Record<string, unknown>;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const rawItems = payload.items ?? payload.tweets ?? body.items ?? body.tweets;
  const items = Array.isArray(rawItems) ? (rawItems as TweetListResult['items']) : [];
  const paginationRaw = (payload.pagination ?? body.pagination ?? {}) as Partial<TweetListResult['pagination']>;

  return {
    items,
    pagination: {
      page: Number(paginationRaw.page) || 1,
      limit: Number(paginationRaw.limit) || 20,
      total: Number(paginationRaw.total) || items.length,
      totalPages: Number(paginationRaw.totalPages) || 1,
    },
  };
}

/**
 * Formats a timestamp as relative time.
 *
 * @param dateString - The timestamp to format
 * @returns Relative time text, or `Just now` for invalid timestamps and timestamps less than 30 seconds old
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(diffSeconds) || diffSeconds < 30) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
