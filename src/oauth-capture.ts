/**
 * OAuth token capture for the API-origin terminal page.
 *
 * The backend finishes an extension Google sign-in by redirecting the browser
 * to `<api>/oauth/callback#accessToken=...&session=...` (or `?error=` on
 * failure). A web page can never reach chrome.storage, so this content script —
 * injected on the API origin — reads the fragment and relays it to the
 * background service worker, which persists the session, closes the tab, and
 * tells the side panel to show the feed. This is more reliable than the
 * background watching `tabs.onUpdated`, because it runs on the page itself
 * instead of racing the service worker's event delivery.
 */
const path = location.pathname.replace(/\/+$/, '') || '/';

if (path === '/oauth/callback') {
  const query = new URLSearchParams(location.search);
  const error = query.get('error');
  if (error) {
    void chrome.runtime.sendMessage({
      action: 'OAUTH_ERROR_CAPTURE',
      error,
      message: query.get('message') || error,
    });
  } else if (location.hash) {
    void chrome.runtime.sendMessage({
      action: 'OAUTH_FRAGMENT_CAPTURE',
      fragment: location.hash,
    });
  }
}
