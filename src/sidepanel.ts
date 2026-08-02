import {
  getSonaraConfig,
  login,
  logout,
  formatTimeAgo,
  getSavedTweets,
  DEFAULT_BACKEND_URL,
} from './api';
import { SonaraConfig, ActiveTabContext, BackendTweetItem, TweetData } from './types';

document.addEventListener('DOMContentLoaded', initPanel);

let currentConfig: SonaraConfig = {
  backendUrl: DEFAULT_BACKEND_URL,
  authenticated: false,
};

let currentTabContext: ActiveTabContext = {
  url: '',
  domain: 'twitter.com',
  isTwitter: true,
};

let tweetsLoading = false;
let cachedTweets: BackendTweetItem[] = [];
let tweetTotal = 0;

async function initPanel(): Promise<void> {
  setupEventListeners();

  try {
    currentConfig = await getSonaraConfig();
    await checkActiveTab();

    if (currentConfig.authenticated) {
      showDashboardView();
    } else {
      showSetupView();
    }
  } catch {
    showSetupView();
  }
}

function workspaceUrl(path = '/'): string {
  const base = (currentConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function openWorkspace(path = '/'): void {
  chrome.tabs.create({ url: workspaceUrl(path) });
}

function setupEventListeners(): void {
  const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleLogin();
  });

  document.getElementById('create-account-btn')?.addEventListener('click', () => {
    openWorkspace('/create-account');
  });

  document.getElementById('google-login-btn')?.addEventListener('click', () => {
    openWorkspace('/auth/google');
  });

  document.getElementById('capture-btn')?.addEventListener('click', () => void handleCapture());
  document.getElementById('refresh-btn')?.addEventListener('click', () => void loadSavedTweets('full'));

  const settingsModal = document.getElementById('settings-modal');
  const openModal = () => {
    updateModalDetails();
    settingsModal?.classList.remove('hidden');
  };
  const closeModal = () => settingsModal?.classList.add('hidden');

  document.getElementById('settings-avatar-btn')?.addEventListener('click', openModal);
  document.getElementById('close-settings-btn')?.addEventListener('click', closeModal);
  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeModal();
  });

  document.getElementById('see-more-btn')?.addEventListener('click', () => {
    closeModal();
    openWorkspace('/account');
  });

  document.getElementById('disconnect-key-btn')?.addEventListener('click', async () => {
    await logout();
    currentConfig = {
      backendUrl: currentConfig.backendUrl || DEFAULT_BACKEND_URL,
      authenticated: false,
    };
    cachedTweets = [];
    tweetTotal = 0;
    closeModal();
    showSetupView();
  });

  document.getElementById('open-command-center-btn')?.addEventListener('click', () => {
    openWorkspace('/');
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === 'TWEETS_UPDATED') {
      if (message.tweet) {
        prependOptimisticTweet(message.tweet as TweetData);
      }
    }
  });
}

function hideBoot(): void {
  document.getElementById('boot-view')?.classList.add('hidden');
}

function showSetupView(): void {
  hideBoot();
  document.getElementById('setup-view')?.classList.remove('hidden');
  document.getElementById('dashboard-view')?.classList.add('hidden');
  resetLoginButton();
}

function showDashboardView(): void {
  hideBoot();
  document.getElementById('setup-view')?.classList.add('hidden');
  document.getElementById('dashboard-view')?.classList.remove('hidden');
  void loadSavedTweets(cachedTweets.length ? 'silent' : 'full');
  updateModalDetails();
}

async function handleLogin(): Promise<void> {
  const emailInput = document.getElementById('login-email') as HTMLInputElement;
  const passwordInput = document.getElementById('login-password') as HTMLInputElement;
  const loginBtn = document.getElementById('init-sync-btn') as HTMLButtonElement;
  const btnText = document.getElementById('sync-btn-text');
  const btnIcon = document.getElementById('sync-btn-icon');
  const btnSpinner = document.getElementById('sync-btn-spinner');

  const email = emailInput?.value?.trim() || '';
  const password = passwordInput?.value || '';

  if (!email || !password) {
    showFeedback('Enter your email and password', 'error');
    return;
  }

  if (btnText) btnText.textContent = 'Signing in…';
  btnIcon?.classList.add('hidden');
  btnSpinner?.classList.remove('hidden');
  loginBtn?.classList.add('is-loading');
  if (loginBtn) loginBtn.disabled = true;

  try {
    const result = await login(email, password);

    if (result.success) {
      currentConfig = result.config || (await getSonaraConfig());
      showFeedback('Signed in', 'success');
      await delay(450);
      showDashboardView();
      resetLoginButton();
    } else {
      showFeedback(result.error || 'Invalid credentials', 'error');
      resetLoginButton();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign in failed';
    showFeedback(message, 'error');
    resetLoginButton();
  }
}

function resetLoginButton(): void {
  const loginBtn = document.getElementById('init-sync-btn') as HTMLButtonElement | null;
  const btnText = document.getElementById('sync-btn-text');
  const btnIcon = document.getElementById('sync-btn-icon');
  const btnSpinner = document.getElementById('sync-btn-spinner');

  if (btnText) btnText.textContent = 'Log in';
  btnIcon?.classList.remove('hidden');
  btnSpinner?.classList.add('hidden');
  loginBtn?.classList.remove('is-loading');
  if (loginBtn) loginBtn.disabled = false;
}

function showFeedback(msg: string, type: 'success' | 'error'): void {
  const feedback = document.getElementById('setup-feedback');
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.classList.remove('hidden', 'success', 'error');
  feedback.classList.add(type);
}

async function checkActiveTab(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    currentTabContext.url = tab.url;
    try {
      const urlObj = new URL(tab.url);
      currentTabContext.domain = urlObj.hostname.replace(/^www\./, '');
      currentTabContext.isTwitter =
        urlObj.hostname.includes('twitter.com') || urlObj.hostname.includes('x.com');
    } catch {
      currentTabContext.domain = 'unknown';
      currentTabContext.isTwitter = false;
    }

    if (tab.id && currentTabContext.isTwitter) {
      chrome.tabs.sendMessage(tab.id, { action: 'GET_DETECTED_CONTEXT' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.detectedContext) {
          updateDetectedContext(response.detectedContext);
        }
      });
    }
  } catch (err) {
    console.warn('Tab query error:', err);
  }
}

function updateDetectedContext(context: {
  author?: { display_name?: string; username?: string };
  content?: { text?: string };
}): void {
  const nameEl = document.getElementById('context-name');
  const handleEl = document.getElementById('context-handle');
  const textEl = document.getElementById('context-text');

  if (nameEl && context.author?.display_name) nameEl.textContent = context.author.display_name;
  if (handleEl && context.author?.username) handleEl.textContent = `@${context.author.username}`;
  if (textEl && context.content?.text) {
    const text = context.content.text;
    textEl.textContent = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  }
}

async function handleCapture(): Promise<void> {
  const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement | null;
  const btnText = document.getElementById('capture-btn-text');
  const btnIcon = document.getElementById('capture-btn-icon');
  const btnSpinner = document.getElementById('capture-spinner');

  if (!captureBtn) return;

  setCaptureLoading(true, 'Adding tweet…');
  if (btnText) btnText.textContent = 'Adding…';
  btnIcon?.classList.add('hidden');
  btnSpinner?.classList.remove('hidden');
  captureBtn.classList.add('is-loading');
  captureBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !currentTabContext.isTwitter) {
      setCaptureOverlayText('Open a tweet on X first');
      await delay(1200);
      resetCaptureButton();
      return;
    }

    await new Promise<void>((resolve) => {
      chrome.tabs.sendMessage(tab.id!, { action: 'CAPTURE_CURRENT_NARRATIVE' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          setCaptureOverlayText(response?.error || 'No tweet detected');
          void delay(1400).then(() => {
            resetCaptureButton();
            resolve();
          });
          return;
        }

        if (response.tweet) {
          prependOptimisticTweet(response.tweet as TweetData);
        }

        setCaptureOverlayText('Saved');
        void delay(500).then(() => {
          resetCaptureButton();
          resolve();
        });
      });
    });
  } catch (err) {
    console.warn('Capture error:', err);
    setCaptureOverlayText('Could not add tweet');
    await delay(1200);
    resetCaptureButton();
  }
}

function setCaptureLoading(active: boolean, text?: string): void {
  const overlay = document.getElementById('capture-overlay');
  if (!overlay) return;
  if (active) {
    if (text) setCaptureOverlayText(text);
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function setCaptureOverlayText(text: string): void {
  const el = document.getElementById('capture-overlay-text');
  if (el) el.textContent = text;
}

function resetCaptureButton(): void {
  const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement | null;
  const btnText = document.getElementById('capture-btn-text');
  const btnIcon = document.getElementById('capture-btn-icon');
  const btnSpinner = document.getElementById('capture-spinner');

  setCaptureLoading(false);
  if (captureBtn) captureBtn.disabled = false;
  captureBtn?.classList.remove('is-loading');
  if (btnText) btnText.textContent = 'Add current tweet';
  btnIcon?.classList.remove('hidden');
  btnSpinner?.classList.add('hidden');
}

function tweetKey(item: Pick<BackendTweetItem, 'id' | 'tweetId'>): string {
  return item.id || item.tweetId;
}

function prependOptimisticTweet(tweet: TweetData): void {
  const handle = tweet.author?.username ? `@${tweet.author.username.replace(/^@/, '')}` : '@unknown';
  const optimistic: BackendTweetItem = {
    id: `local_${tweet.id}`,
    userId: currentConfig.user?.id || '',
    tweetId: tweet.id,
    text: tweet.content?.text || '',
    authorHandle: handle,
    authorName: tweet.author?.display_name || handle,
    authorAvatarUrl: tweet.author?.avatar_url || null,
    sourceUrl: tweet.url,
    mediaUrls: Array.isArray(tweet.content?.media) ? (tweet.content.media as string[]) : [],
    metricsLikes: tweet.metrics?.likes || 0,
    metricsRetweets: tweet.metrics?.retweets || 0,
    metricsReplies: tweet.metrics?.replies || 0,
    isThread: Boolean(tweet.context?.is_reply || tweet.context?.is_quote),
    createdAt: tweet.captured_at || new Date().toISOString(),
    savedAt: new Date().toISOString(),
  };

  if (cachedTweets.some((t) => t.tweetId === optimistic.tweetId)) return;

  cachedTweets = [optimistic, ...cachedTweets];
  tweetTotal += 1;
  insertTweetElement(optimistic, true);
  updateTweetCount();
}

function insertTweetElement(item: BackendTweetItem, highlight = false): void {
  const listEl = document.getElementById('saved-tweets-list');
  if (!listEl) return;

  listEl.querySelector('.empty-state')?.remove();
  listEl.querySelectorAll('.tweet-skeleton').forEach((el) => el.remove());

  const existing = listEl.querySelector(`[data-tweet-id="${CSS.escape(item.tweetId)}"]`);
  if (existing) return;

  const el = buildTweetElement(item, highlight);
  listEl.prepend(el);
}

function buildTweetElement(item: BackendTweetItem, highlight = false): HTMLElement {
  const el = document.createElement('div');
  el.className = highlight ? 'tweet-item tweet-item-new' : 'tweet-item';
  el.dataset.tweetId = item.tweetId;
  el.dataset.id = item.id;

  const author = item.authorName || item.authorHandle || 'Unknown';
  const handle = item.authorHandle ? `@${String(item.authorHandle).replace(/^@/, '')}` : '';
  const text = item.text || 'No text';
  const time = formatTimeAgo(item.savedAt || item.createdAt);

  el.innerHTML = `
    <div class="tweet-item-top">
      <div class="tweet-author">
        <span class="tweet-author-name">${escapeHtml(author)}</span>
        <span class="tweet-author-handle">${escapeHtml(handle)}</span>
      </div>
      <span class="tweet-time">${escapeHtml(time)}</span>
    </div>
    <div class="tweet-text">${escapeHtml(text)}</div>
    <div class="tweet-meta">
      <span><span class="material-symbols-outlined">favorite</span> ${Number(item.metricsLikes) || 0}</span>
      <span><span class="material-symbols-outlined">repeat</span> ${Number(item.metricsRetweets) || 0}</span>
      <span><span class="material-symbols-outlined">chat_bubble</span> ${Number(item.metricsReplies) || 0}</span>
    </div>
  `;

  el.addEventListener('click', () => {
    if (item.sourceUrl) chrome.tabs.create({ url: item.sourceUrl });
  });

  return el;
}

function updateTweetCount(): void {
  const countEl = document.getElementById('tweet-count');
  if (countEl) countEl.textContent = String(tweetTotal);
}

function renderTweetSkeletons(): void {
  const listEl = document.getElementById('saved-tweets-list');
  if (!listEl) return;
  listEl.innerHTML = `
    <div class="tweet-skeleton" aria-hidden="true">
      <div class="skel skel-line short"></div>
      <div class="skel skel-line"></div>
      <div class="skel skel-line mid"></div>
    </div>
    <div class="tweet-skeleton" aria-hidden="true">
      <div class="skel skel-line short"></div>
      <div class="skel skel-line"></div>
      <div class="skel skel-line mid"></div>
    </div>
  `;
}

function renderTweetList(items: BackendTweetItem[]): void {
  const listEl = document.getElementById('saved-tweets-list');
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        No saved tweets yet. Add a tweet from X to see it here.
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  items.forEach((item, index) => {
    const el = buildTweetElement(item);
    el.style.animationDelay = `${Math.min(index, 8) * 40}ms`;
    listEl.appendChild(el);
  });
}

function mergeSilent(items: BackendTweetItem[], total: number): void {
  const listEl = document.getElementById('saved-tweets-list');
  if (!listEl) return;

  const prevKeys = new Set(cachedTweets.map(tweetKey));
  const nextKeys = new Set(items.map(tweetKey));
  const byTweetId = new Map(items.map((item) => [item.tweetId, item]));

  // Drop optimistic locals once the real tweetId is present from the API.
  cachedTweets = cachedTweets.filter((item) => {
    if (!item.id.startsWith('local_')) return true;
    return !byTweetId.has(item.tweetId);
  });

  const knownTweetIds = new Set(cachedTweets.map((t) => t.tweetId));
  const newcomers = items.filter((item) => !knownTweetIds.has(item.tweetId) && !prevKeys.has(tweetKey(item)));

  if (cachedTweets.length === 0 && items.length > 0) {
    cachedTweets = items;
    tweetTotal = total;
    updateTweetCount();
    renderTweetList(items);
    return;
  }

  // Prepend only brand-new tweets without wiping the list.
  newcomers.reverse().forEach((item) => insertTweetElement(item, true));

  // Replace optimistic nodes with canonical backend rows when ids match by tweetId.
  items.forEach((item) => {
    const node = listEl.querySelector(`[data-tweet-id="${CSS.escape(item.tweetId)}"]`) as HTMLElement | null;
    if (!node) return;
    if (node.dataset.id?.startsWith('local_') || node.dataset.id !== item.id) {
      const fresh = buildTweetElement(item, node.classList.contains('tweet-item-new'));
      node.replaceWith(fresh);
    }
  });

  cachedTweets = items;
  tweetTotal = total;
  updateTweetCount();

  // If everything was removed server-side, show empty state.
  if (items.length === 0) {
    renderTweetList([]);
    return;
  }

  // Remove DOM nodes that no longer exist on the server (except still-pending locals).
  listEl.querySelectorAll<HTMLElement>('.tweet-item').forEach((node) => {
    const id = node.dataset.id || '';
    const tweetId = node.dataset.tweetId || '';
    if (id.startsWith('local_')) return;
    if (!nextKeys.has(id) && !byTweetId.has(tweetId)) {
      node.remove();
    }
  });
}

async function loadSavedTweets(mode: 'full' | 'silent' = 'full'): Promise<void> {
  const listEl = document.getElementById('saved-tweets-list');
  const refreshBtn = document.getElementById('refresh-btn');
  if (!listEl || tweetsLoading) return;

  tweetsLoading = true;
  if (mode === 'full') {
    refreshBtn?.classList.add('is-spinning');
    renderTweetSkeletons();
  }

  try {
    const result = await getSavedTweets();
    const items = result.items;
    const total = result.pagination?.total ?? items.length;

    if (mode === 'silent' && cachedTweets.length > 0) {
      mergeSilent(items, total);
    } else {
      cachedTweets = items;
      tweetTotal = total;
      updateTweetCount();
      renderTweetList(items);
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'UNAUTHENTICATED') {
      showSetupView();
      return;
    }
    if (mode === 'full' || cachedTweets.length === 0) {
      tweetTotal = 0;
      updateTweetCount();
      const message = err instanceof Error ? err.message : 'Unknown error';
      listEl.innerHTML = `
        <div class="empty-state">
          Couldn’t load tweets. ${escapeHtml(message)}
        </div>
      `;
    }
  } finally {
    tweetsLoading = false;
    refreshBtn?.classList.remove('is-spinning');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateModalDetails(): void {
  const identityEl = document.getElementById('modal-identity');
  const emailEl = document.getElementById('modal-email');
  const avatarEl = document.getElementById('modal-avatar');
  const user = currentConfig.user;

  const name =
    [user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(' ') ||
    user?.email?.split('@')[0] ||
    'Signed in';
  const email = user?.email || '';

  if (identityEl) identityEl.textContent = name;
  if (emailEl) emailEl.textContent = email || '—';

  if (avatarEl) {
    const url = user?.profile?.avatarUrl;
    if (url) {
      avatarEl.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`;
    } else {
      const initial = (name || '?').charAt(0).toUpperCase();
      avatarEl.innerHTML = `<span class="profile-initial">${escapeHtml(initial)}</span>`;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
