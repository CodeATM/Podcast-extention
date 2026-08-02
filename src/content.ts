import { TweetData, TweetAuthor, TweetMetrics, TweetContext } from './types';

const MIC_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" style="width: 18px; height: 18px; fill: currentColor;">
  <g>
    <path d="M12 2C9.243 2 7 4.243 7 7v6c0 2.757 2.243 5 5 5s5-2.243 5-5V7c0-2.757-2.243-5-5-5zm-3 7c0-1.654 1.346-3 3-3s3 1.346 3 3v6c0 1.654-1.346 3-3 3s-3-1.346-3-3V9zm11 4h-2c0 3.309-2.691 6-6 6s-6-2.691-6-6H4c0 3.998 3.019 7.311 6.837 7.915l-.82 2.46 1.896.632 1.05-3.151C12.639 20.938 12.32 20.957 12 20.957s-.639-.019-1.163-.093l1.05 3.151 1.896-.632-.82-2.46A8.006 8.006 0 0 0 20 13z"></path>
  </g>
</svg>
`;

const CHECK_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" style="width: 18px; height: 18px; fill: currentColor;">
    <g>
        <path d="M9.55 18.2L3.65 12.3 5.075 10.875 9.55 15.35 18.925 5.975 20.35 7.4Z"></path>
    </g>
</svg>
`;

const SPINNER_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="t2p-spin" style="width: 18px; height: 18px; fill: currentColor;">
  <path d="M12 2a10 10 0 1 0 10 10h-2.5A7.5 7.5 0 1 1 12 4.5V2z"></path>
</svg>
`;

function findAncestor(el: HTMLElement | null, selector: string): HTMLElement | null {
  while (el && (el = el.parentElement)) {
    if (el.matches(selector)) return el;
  }
  return null;
}

/**
 * Ask the background service worker whether the user holds a valid session.
 * Content scripts never inspect tokens themselves — auth lives in the worker.
 */
function isAuthenticated(): Promise<{ authed: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        return resolve({ authed: false, error: 'Extension updated. Please refresh this tab.' });
      }
      chrome.runtime.sendMessage({ action: 'AUTH_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          if (msg.includes('invalidated')) {
            return resolve({ authed: false, error: 'Extension updated. Please refresh this tab.' });
          }
          return resolve({ authed: false, error: 'Extension background worker unavailable.' });
        }
        if (!response) {
          return resolve({ authed: false, error: 'Sign in to Sonara to save tweets.' });
        }
        const authed = Boolean((response as { authenticated?: boolean }).authenticated);
        if (!authed) {
          return resolve({ authed: false, error: 'Sign in to Sonara to save tweets.' });
        }
        resolve({ authed: true });
      });
    } catch {
      resolve({ authed: false, error: 'Extension updated. Please refresh this tab.' });
    }
  });
}

function showToast(message: string, isError = false): void {
  const id = 't2p-toast';
  let toast = document.getElementById(id) as HTMLDivElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.id = id;
    toast.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:999999;' +
      'padding:10px 14px;border-radius:10px;font:600 13px/1.4 sans-serif;color:#fff;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.45);transition:opacity .3s ease;max-width:300px;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.style.background = isError ? '#7f1d1d' : '#1a1625';
  toast.style.border = isError ? '1px solid #f87171' : '1px solid rgba(139, 92, 246, 0.45)';
  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.opacity = '0';
  clearTimeout(Number(toast.dataset.timer || 0));
  requestAnimationFrame(() => {
    if (toast) toast.style.opacity = '1';
  });
  toast.dataset.timer = String(
    window.setTimeout(() => {
      if (toast) toast.style.opacity = '0';
    }, 2600)
  );
}

// Inject Sonara Capture buttons into Twitter action bars
function injectButtons(): void {
  const actionBars = document.querySelectorAll('div[role="group"]:not(.t2p-processed)');

  actionBars.forEach((bar) => {
    const hasLike = bar.querySelector('[data-testid="like"], [aria-label*="like" i]');
    const hasReply = bar.querySelector('[data-testid="reply"], [aria-label*="reply" i]');
    const hasRetweet = bar.querySelector('[data-testid="retweet"], [aria-label*="retweet" i], [aria-label*="Repost" i]');

    if (hasLike || hasReply || hasRetweet) {
      bar.classList.add('t2p-processed');
      if (bar.querySelector('.t2p-button')) return;

      const btn = document.createElement('button');
      btn.className = 't2p-button';
      btn.innerHTML = MIC_ICON;
      btn.setAttribute('aria-label', 'Save to Sonara');
      btn.title = 'Save to Sonara';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTweetClick(btn);
      });

      bar.appendChild(btn);
    }
  });
}

// Observe DOM mutations for dynamic Twitter feeds
let _injectTimer: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(() => {
  if (_injectTimer !== null) return;
  _injectTimer = setTimeout(() => {
    _injectTimer = null;
    injectButtons();
  }, 100);
});

observer.observe(document.body, { childList: true, subtree: true });
setTimeout(() => injectButtons(), 1000);

async function handleTweetClick(btn: HTMLButtonElement): Promise<void> {
  if (btn.classList.contains('t2p-busy')) return;
  btn.classList.add('t2p-busy');

  try {
    const authResult = await isAuthenticated();
    if (!authResult.authed) {
      btn.classList.remove('t2p-busy');
      showToast(authResult.error || 'Sign in to Sonara to save tweets.', true);
      return;
    }

    const tweetArticle =
      findAncestor(btn, 'article[data-testid="tweet"]') ||
      findAncestor(btn, 'article') ||
      findAncestor(btn, '[data-testid="tweet"]');

    if (!tweetArticle) {
      btn.classList.remove('t2p-busy');
      console.warn('Could not locate tweet article ancestor.');
      return;
    }

    btn.innerHTML = SPINNER_ICON;

    const tweetData = extractTweetData(tweetArticle);
    const saved = await syncTweetToBackend(tweetData);

    if (!saved) {
      btn.innerHTML = MIC_ICON;
      btn.classList.remove('t2p-busy');
      showToast('Couldn’t save tweet. Check your connection and try again.', true);
      return;
    }

    notifyTweetsUpdated(tweetData);
    showToast('Tweet saved');

    btn.innerHTML = CHECK_ICON;
    btn.classList.add('t2p-added');
    btn.classList.remove('t2p-busy');
    setTimeout(() => {
      btn.innerHTML = MIC_ICON;
      btn.classList.remove('t2p-added');
    }, 2200);
  } catch (error) {
    console.error('Error handling tweet capture:', error);
    btn.innerHTML = MIC_ICON;
    btn.classList.remove('t2p-busy');
    showToast('Something went wrong while saving.', true);
  }
}

function extractTweetData(article: HTMLElement): TweetData {
  const userEl = article.querySelector('[data-testid="User-Name"]');
  let displayName = 'Twitter User';
  let username = 'user';

  if (userEl) {
    const spans = userEl.querySelectorAll('span');
    if (spans.length > 0) displayName = spans[0].textContent?.trim() || displayName;

    const handleMatch = userEl.textContent?.match(/@([A-Za-z0-9_]+)/);
    if (handleMatch) username = handleMatch[1];
  }

  const author: TweetAuthor = {
    display_name: displayName,
    username: username
  };

  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl?.textContent?.trim() || '';

  const likes = parseMetric(article.querySelector('[data-testid="like"]'));
  const retweets = parseMetric(article.querySelector('[data-testid="retweet"]'));
  const replies = parseMetric(article.querySelector('[data-testid="reply"]'));
  const views = parseMetric(article.querySelector('[data-testid="analytics"]'));

  const metrics: TweetMetrics = { likes, retweets, replies, views };

  const timeEl = article.querySelector('time');
  const anchorEl = timeEl?.closest('a') as HTMLAnchorElement | null;
  const tweetUrl = anchorEl?.href || window.location.href;
  const tweetId = tweetUrl.match(/status\/(\d+)/)?.[1] || `tw_${Date.now()}`;

  const context: TweetContext = {
    is_reply: !!article.querySelector('[data-testid="reply-to"]') ||
              !!Array.from(article.querySelectorAll('span')).find(
                (el) => el.textContent?.trim().toLowerCase().startsWith('replying to')
              ),
    is_quote: !!article.querySelector('[data-testid="quote"]')
  };

  return {
    id: tweetId,
    url: tweetUrl,
    captured_at: new Date().toISOString(),
    author,
    content: { text },
    context,
    metrics,
    initial_tags: ['sonara_capture'],
    collector_note: 'Sonara capture',
  };
}

function parseMetric(el: Element | null): number {
  if (!el) return 0;
  const text = el.textContent || '';
  const numMatch = text.match(/([\d,.]+)\s*([KMkm]?)/);
  if (!numMatch) return 0;

  let val = parseFloat(numMatch[1].replace(/,/g, ''));
  const unit = numMatch[2].toUpperCase();
  if (unit === 'K') val *= 1000;
  if (unit === 'M') val *= 1000000;

  return Math.round(val);
}

async function syncTweetToBackend(tweetData: TweetData): Promise<boolean> {
  return new Promise((resolve) => {
    // Protected API calls go through the background service worker only.
    chrome.runtime.sendMessage(
      { action: 'API_SAVE_CONTENT', tweet: tweetData },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Background sync notice:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        if (!response?.success) {
          console.warn('Background sync notice:', response?.error || 'sync failed');
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}

function notifyTweetsUpdated(tweet?: TweetData): void {
  try {
    chrome.runtime.sendMessage({ action: 'TWEETS_UPDATED', tweet }, () => void chrome.runtime.lastError);
  } catch {
    // Non-fatal: the panel refreshes on open anyway.
  }
}

// Chrome extension message listener
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_DETECTED_CONTEXT') {
    const mainTweet = document.querySelector('article[data-testid="tweet"]') as HTMLElement;
    if (mainTweet) {
      const data = extractTweetData(mainTweet);
      sendResponse({ detectedContext: data });
    } else {
      sendResponse({ detectedContext: null });
    }
    return true;
  }

  if (request.action === 'CAPTURE_CURRENT_NARRATIVE') {
    const mainTweet = document.querySelector('article[data-testid="tweet"]') as HTMLElement;
    if (mainTweet) {
      const data = extractTweetData(mainTweet);
      syncTweetToBackend(data).then((saved) => {
        if (saved) {
          notifyTweetsUpdated(data);
          sendResponse({ success: true, tweet: data });
        } else {
          sendResponse({ success: false, error: 'Backend sync failed. Sign in first and try again.' });
        }
      }).catch(err => {
        sendResponse({ success: false, error: err?.message || String(err) });
      });
    } else {
      sendResponse({ success: false, error: 'No tweet article currently visible on page.' });
    }
    return true;
  }
});
