export interface TweetAuthor {
  display_name: string;
  username: string;
  verified?: boolean;
  avatar_url?: string;
}

export interface TweetMetrics {
  likes: number;
  retweets: number;
  replies: number;
  views: number;
}

export interface TweetContext {
  is_reply: boolean;
  is_quote: boolean;
  reply_to_id?: string;
  reply_to_data?: Partial<TweetData>;
  quoted_tweet_id?: string;
  quoted_tweet_data?: Partial<TweetData>;
}

export interface TweetData {
  id: string;
  url: string;
  captured_at: string;
  author: TweetAuthor;
  content: {
    text: string;
    media?: string[];
  };
  context: TweetContext;
  metrics: TweetMetrics;
  initial_tags: string[];
  collector_note?: string;
  sync_status?: 'synced' | 'pending' | 'failed';
}

export interface AuthUser {
  id: string;
  email: string;
  isActive: boolean;
  profile?: {
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
}

export interface AuthSession {
  id: string;
  jti: string;
  clientType: string;
  deviceName: string | null;
  expiresAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  expiresIn: number;
}

export interface SonaraConfig {
  backendUrl: string;
  authenticated: boolean;
  user?: AuthUser | null;
  session?: AuthSession | null;
}

export interface BackendSyncResponse {
  success: boolean;
  narrativeId?: string;
  identity?: string;
  message?: string;
  error?: string;
}

export interface ActiveTabContext {
  url: string;
  domain: string;
  isTwitter: boolean;
  detectedTweet?: Partial<TweetData>;
  density?: string;
}

/** A saved tweet as returned by the backend `GET /api/tweets`. */
export interface BackendTweetItem {
  id: string;
  userId: string;
  tweetId: string;
  text: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  sourceUrl: string;
  mediaUrls: string[];
  metricsLikes: number;
  metricsRetweets: number;
  metricsReplies: number;
  isThread: boolean;
  createdAt: string;
  savedAt: string;
}

export interface TweetListResult {
  items: BackendTweetItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Messages handled exclusively by the background service worker */
export type BackgroundMessage =
  | { action: 'AUTH_LOGIN'; email: string; password: string; backendUrl?: string }
  | { action: 'AUTH_LOGOUT' }
  | { action: 'AUTH_STATUS' }
  | { action: 'AUTH_GET_CONFIG' }
  | { action: 'SET_BACKEND_URL'; backendUrl: string }
  | { action: 'API_SAVE_CONTENT'; tweet: TweetData }
  | { action: 'API_FETCH'; path: string; method?: string; body?: unknown }
  | { action: 'TWEETS_UPDATED' };

export type BackgroundResponse =
  | { success: true; data?: unknown; config?: SonaraConfig; authenticated?: boolean }
  | { success: false; error: string; code?: string };
