"use strict";
(() => {
  // src/auth/storage.ts
  var DEFAULT_BACKEND_URL = "http://localhost:5000";

  /**
   * Sends a message to the extension's background process.
   * @param {*} message - The message to send.
   * @return {Promise<Object>} A response object containing the background result or an error.
   */
  function sendToBackground(message) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        resolve({ success: false, error: "Extension runtime unavailable" });
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message || "Messaging failed" });
          return;
        }
        resolve(response || { success: false, error: "Empty response from background" });
      });
    });
  }
  /**
   * Retrieves the Sonara backend configuration and authentication state.
   * @return {Object} The configured Sonara settings, or default backend settings with authentication disabled.
   */
  async function getSonaraConfig() {
    const response = await sendToBackground({ action: "AUTH_GET_CONFIG" });
    if (response.success && response.config) {
      return response.config;
    }
    return {
      backendUrl: DEFAULT_BACKEND_URL,
      authenticated: false
    };
  }
  /**
   * Authenticates a user with the provided credentials and backend URL.
   * @param {string} email - The user's email address.
   * @param {string} password - The user's password.
   * @param {string} backendUrl - The backend URL used for authentication.
   * @return {Promise<*>} The authentication response.
   */
  async function login(email, password, backendUrl) {
    return sendToBackground({ action: "AUTH_LOGIN", email, password, backendUrl });
  }
  /**
   * Signs the current user out.
   * @return {Object} The background response for the logout request.
   */
  async function logout() {
    return sendToBackground({ action: "AUTH_LOGOUT" });
  }
  /**
   * Loads saved tweets and normalizes their pagination data.
   * @return {{items: Array, pagination: {page: number, limit: number, total: number, totalPages: number}}} The saved tweets and pagination metadata.
   * @throws {Error} If the request fails.
   */
  async function getSavedTweets() {
    const response = await sendToBackground({ action: "API_FETCH", path: "/api/tweets", method: "GET" });
    if (!response.success) {
      const err = new Error(response.error || "Failed to load saved tweets");
      err.code = response.code;
      throw err;
    }
    const body = response.data ?? {};
    const payload = body.data && typeof body.data === "object" ? body.data : body;
    const rawItems = payload.items ?? payload.tweets ?? body.items ?? body.tweets;
    const items = Array.isArray(rawItems) ? rawItems : [];
    const paginationRaw = payload.pagination ?? body.pagination ?? {};
    return {
      items,
      pagination: {
        page: Number(paginationRaw.page) || 1,
        limit: Number(paginationRaw.limit) || 20,
        total: Number(paginationRaw.total) || items.length,
        totalPages: Number(paginationRaw.totalPages) || 1
      }
    };
  }
  /**
   * Formats a timestamp as relative time from the current moment.
   * @param {string} dateString - The timestamp to format.
   * @return {string} Relative time such as "Just now", "45s ago", or "2 days ago".
   */
  function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = /* @__PURE__ */ new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1e3);
    if (isNaN(diffSeconds) || diffSeconds < 30)
      return "Just now";
    if (diffSeconds < 60)
      return `${diffSeconds}s ago`;
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60)
      return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  // src/sidepanel.ts
  document.addEventListener("DOMContentLoaded", initPanel);
  var currentConfig = {
    backendUrl: DEFAULT_BACKEND_URL,
    authenticated: false
  };
  var currentTabContext = {
    url: "",
    domain: "twitter.com",
    isTwitter: true
  };
  var tweetsLoading = false;
  var cachedTweets = [];
  var tweetTotal = 0;
  /**
   * Initializes the side panel and displays the appropriate view based on authentication state.
   */
  async function initPanel() {
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
  /**
   * Builds a workspace URL from the configured backend address and path.
   * @param {string} [path="/"] - The workspace path to append.
   * @return {string} The complete workspace URL.
   */
  function workspaceUrl(path = "/") {
    const base = (currentConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }
  /**
   * Opens a workspace page in a new browser tab.
   * @param {string} [path="/"] - The workspace path to open.
   */
  function openWorkspace(path = "/") {
    chrome.tabs.create({ url: workspaceUrl(path) });
  }
  /**
   * Registers event handlers for authentication, tweet capture, saved-tweet management, settings, workspace navigation, and background tweet updates.
   */
  function setupEventListeners() {
    const loginForm = document.getElementById("login-form");
    loginForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      void handleLogin();
    });
    document.getElementById("create-account-btn")?.addEventListener("click", () => {
      openWorkspace("/create-account");
    });
    document.getElementById("google-login-btn")?.addEventListener("click", () => {
      openWorkspace("/auth/google");
    });
    document.getElementById("capture-btn")?.addEventListener("click", () => void handleCapture());
    document.getElementById("refresh-btn")?.addEventListener("click", () => void loadSavedTweets("full"));
    const settingsModal = document.getElementById("settings-modal");
    const openModal = () => {
      updateModalDetails();
      settingsModal?.classList.remove("hidden");
    };
    const closeModal = () => settingsModal?.classList.add("hidden");
    document.getElementById("settings-avatar-btn")?.addEventListener("click", openModal);
    document.getElementById("close-settings-btn")?.addEventListener("click", closeModal);
    settingsModal?.addEventListener("click", (e) => {
      if (e.target === settingsModal)
        closeModal();
    });
    document.getElementById("see-more-btn")?.addEventListener("click", () => {
      closeModal();
      openWorkspace("/account");
    });
    document.getElementById("disconnect-key-btn")?.addEventListener("click", async () => {
      await logout();
      currentConfig = {
        backendUrl: currentConfig.backendUrl || DEFAULT_BACKEND_URL,
        authenticated: false
      };
      cachedTweets = [];
      tweetTotal = 0;
      closeModal();
      showSetupView();
    });
    document.getElementById("open-command-center-btn")?.addEventListener("click", () => {
      openWorkspace("/");
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action === "TWEETS_UPDATED") {
        if (message.tweet) {
          prependOptimisticTweet(message.tweet);
        }
      }
    });
  }
  /**
   * Hides the panel's boot view.
   */
  function hideBoot() {
    document.getElementById("boot-view")?.classList.add("hidden");
  }
  /**
   * Displays the setup view and resets the login button state.
   */
  function showSetupView() {
    hideBoot();
    document.getElementById("setup-view")?.classList.remove("hidden");
    document.getElementById("dashboard-view")?.classList.add("hidden");
    resetLoginButton();
  }
  /**
   * Displays the dashboard view and loads its saved tweets.
   */
  function showDashboardView() {
    hideBoot();
    document.getElementById("setup-view")?.classList.add("hidden");
    document.getElementById("dashboard-view")?.classList.remove("hidden");
    void loadSavedTweets(cachedTweets.length ? "silent" : "full");
    updateModalDetails();
  }
  /**
   * Handles user sign-in from the login form and displays the resulting status.
   */
  async function handleLogin() {
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const loginBtn = document.getElementById("init-sync-btn");
    const btnText = document.getElementById("sync-btn-text");
    const btnIcon = document.getElementById("sync-btn-icon");
    const btnSpinner = document.getElementById("sync-btn-spinner");
    const email = emailInput?.value?.trim() || "";
    const password = passwordInput?.value || "";
    if (!email || !password) {
      showFeedback("Enter your email and password", "error");
      return;
    }
    if (btnText)
      btnText.textContent = "Signing in\u2026";
    btnIcon?.classList.add("hidden");
    btnSpinner?.classList.remove("hidden");
    loginBtn?.classList.add("is-loading");
    if (loginBtn)
      loginBtn.disabled = true;
    try {
      const result = await login(email, password);
      if (result.success) {
        currentConfig = result.config || await getSonaraConfig();
        showFeedback("Signed in", "success");
        await delay(450);
        showDashboardView();
        resetLoginButton();
      } else {
        showFeedback(result.error || "Invalid credentials", "error");
        resetLoginButton();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      showFeedback(message, "error");
      resetLoginButton();
    }
  }
  /**
   * Restores the login button to its default enabled state.
   */
  function resetLoginButton() {
    const loginBtn = document.getElementById("init-sync-btn");
    const btnText = document.getElementById("sync-btn-text");
    const btnIcon = document.getElementById("sync-btn-icon");
    const btnSpinner = document.getElementById("sync-btn-spinner");
    if (btnText)
      btnText.textContent = "Log in";
    btnIcon?.classList.remove("hidden");
    btnSpinner?.classList.add("hidden");
    loginBtn?.classList.remove("is-loading");
    if (loginBtn)
      loginBtn.disabled = false;
  }
  /**
   * Displays a setup feedback message with the specified status styling.
   * @param {string} msg - The feedback message to display.
   * @param {string} type - The feedback status type, such as `success` or `error`.
   */
  function showFeedback(msg, type) {
    const feedback = document.getElementById("setup-feedback");
    if (!feedback)
      return;
    feedback.textContent = msg;
    feedback.classList.remove("hidden", "success", "error");
    feedback.classList.add(type);
  }
  /**
   * Updates the current tab context and retrieves detected tweet details from Twitter or X tabs.
   */
  async function checkActiveTab() {
    if (typeof chrome === "undefined" || !chrome.tabs)
      return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url)
        return;
      currentTabContext.url = tab.url;
      try {
        const urlObj = new URL(tab.url);
        currentTabContext.domain = urlObj.hostname.replace(/^www\./, "");
        currentTabContext.isTwitter = urlObj.hostname.includes("twitter.com") || urlObj.hostname.includes("x.com");
      } catch {
        currentTabContext.domain = "unknown";
        currentTabContext.isTwitter = false;
      }
      if (tab.id && currentTabContext.isTwitter) {
        chrome.tabs.sendMessage(tab.id, { action: "GET_DETECTED_CONTEXT" }, (response) => {
          if (chrome.runtime.lastError)
            return;
          if (response?.detectedContext) {
            updateDetectedContext(response.detectedContext);
          }
        });
      }
    } catch (err) {
      console.warn("Tab query error:", err);
    }
  }
  /**
   * Updates the detected tweet context displayed in the panel.
   * @param {Object} context - The detected tweet context containing author and content details.
   */
  function updateDetectedContext(context) {
    const nameEl = document.getElementById("context-name");
    const handleEl = document.getElementById("context-handle");
    const textEl = document.getElementById("context-text");
    if (nameEl && context.author?.display_name)
      nameEl.textContent = context.author.display_name;
    if (handleEl && context.author?.username)
      handleEl.textContent = `@${context.author.username}`;
    if (textEl && context.content?.text) {
      const text = context.content.text;
      textEl.textContent = text.length > 160 ? `${text.slice(0, 160)}\u2026` : text;
    }
  }
  /**
   * Captures the tweet from the active X tab and adds it to the saved-tweet list.
   */
  async function handleCapture() {
    const captureBtn = document.getElementById("capture-btn");
    const btnText = document.getElementById("capture-btn-text");
    const btnIcon = document.getElementById("capture-btn-icon");
    const btnSpinner = document.getElementById("capture-spinner");
    if (!captureBtn)
      return;
    setCaptureLoading(true, "Adding tweet\u2026");
    if (btnText)
      btnText.textContent = "Adding\u2026";
    btnIcon?.classList.add("hidden");
    btnSpinner?.classList.remove("hidden");
    captureBtn.classList.add("is-loading");
    captureBtn.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !currentTabContext.isTwitter) {
        setCaptureOverlayText("Open a tweet on X first");
        await delay(1200);
        resetCaptureButton();
        return;
      }
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_CURRENT_NARRATIVE" }, (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            setCaptureOverlayText(response?.error || "No tweet detected");
            void delay(1400).then(() => {
              resetCaptureButton();
              resolve();
            });
            return;
          }
          if (response.tweet) {
            prependOptimisticTweet(response.tweet);
          }
          setCaptureOverlayText("Saved");
          void delay(500).then(() => {
            resetCaptureButton();
            resolve();
          });
        });
      });
    } catch (err) {
      console.warn("Capture error:", err);
      setCaptureOverlayText("Could not add tweet");
      await delay(1200);
      resetCaptureButton();
    }
  }
  /**
   * Shows or hides the capture overlay and optionally updates its message.
   * @param {boolean} active - Whether the capture overlay should be visible.
   * @param {string} [text] - Optional message to display when showing the overlay.
   */
  function setCaptureLoading(active, text) {
    const overlay = document.getElementById("capture-overlay");
    if (!overlay)
      return;
    if (active) {
      if (text)
        setCaptureOverlayText(text);
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
    }
  }
  /**
   * Updates the capture overlay message.
   * @param {string} text - The message to display.
   */
  function setCaptureOverlayText(text) {
    const el = document.getElementById("capture-overlay-text");
    if (el)
      el.textContent = text;
  }
  function resetCaptureButton() {
    const captureBtn = document.getElementById("capture-btn");
    const btnText = document.getElementById("capture-btn-text");
    const btnIcon = document.getElementById("capture-btn-icon");
    const btnSpinner = document.getElementById("capture-spinner");
    setCaptureLoading(false);
    if (captureBtn)
      captureBtn.disabled = false;
    captureBtn?.classList.remove("is-loading");
    if (btnText)
      btnText.textContent = "Add current tweet";
    btnIcon?.classList.remove("hidden");
    btnSpinner?.classList.add("hidden");
  }
  /**
   * Retrieves the identifier for a tweet item.
   * @param {Object} item - The tweet item.
   * @return {*} The item's `id` or `tweetId` value.
   */
  function tweetKey(item) {
    return item.id || item.tweetId;
  }
  /**
   * Adds a newly captured tweet to the saved-tweet display and cached collection.
   * @param {Object} tweet - Captured tweet data used to build the saved-tweet display model.
   */
  function prependOptimisticTweet(tweet) {
    const handle = tweet.author?.username ? `@${tweet.author.username.replace(/^@/, "")}` : "@unknown";
    const optimistic = {
      id: `local_${tweet.id}`,
      userId: currentConfig.user?.id || "",
      tweetId: tweet.id,
      text: tweet.content?.text || "",
      authorHandle: handle,
      authorName: tweet.author?.display_name || handle,
      authorAvatarUrl: tweet.author?.avatar_url || null,
      sourceUrl: tweet.url,
      mediaUrls: Array.isArray(tweet.content?.media) ? tweet.content.media : [],
      metricsLikes: tweet.metrics?.likes || 0,
      metricsRetweets: tweet.metrics?.retweets || 0,
      metricsReplies: tweet.metrics?.replies || 0,
      isThread: Boolean(tweet.context?.is_reply || tweet.context?.is_quote),
      createdAt: tweet.captured_at || (/* @__PURE__ */ new Date()).toISOString(),
      savedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (cachedTweets.some((t) => t.tweetId === optimistic.tweetId))
      return;
    cachedTweets = [optimistic, ...cachedTweets];
    tweetTotal += 1;
    insertTweetElement(optimistic, true);
    updateTweetCount();
  }
  /**
   * Inserts a saved tweet at the beginning of the tweet list.
   * @param {Object} item - The saved tweet to display.
   * @param {boolean} [highlight=false] - Whether to highlight the inserted tweet.
   */
  function insertTweetElement(item, highlight = false) {
    const listEl = document.getElementById("saved-tweets-list");
    if (!listEl)
      return;
    listEl.querySelector(".empty-state")?.remove();
    listEl.querySelectorAll(".tweet-skeleton").forEach((el2) => el2.remove());
    const existing = listEl.querySelector(`[data-tweet-id="${CSS.escape(item.tweetId)}"]`);
    if (existing)
      return;
    const el = buildTweetElement(item, highlight);
    listEl.prepend(el);
  }
  /**
   * Creates a rendered saved-tweet element with author details, timestamp, text, engagement metrics, and an optional highlight style.
   * @param {Object} item - The saved tweet data.
   * @param {boolean} [highlight=false] - Whether to apply the new-tweet highlight style.
   * @return {HTMLElement} The rendered tweet element.
   */
  function buildTweetElement(item, highlight = false) {
    const el = document.createElement("div");
    el.className = highlight ? "tweet-item tweet-item-new" : "tweet-item";
    el.dataset.tweetId = item.tweetId;
    el.dataset.id = item.id;
    const author = item.authorName || item.authorHandle || "Unknown";
    const handle = item.authorHandle ? `@${String(item.authorHandle).replace(/^@/, "")}` : "";
    const text = item.text || "No text";
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
    el.addEventListener("click", () => {
      if (item.sourceUrl)
        chrome.tabs.create({ url: item.sourceUrl });
    });
    return el;
  }
  /**
   * Updates the displayed count of saved tweets.
   */
  function updateTweetCount() {
    const countEl = document.getElementById("tweet-count");
    if (countEl)
      countEl.textContent = String(tweetTotal);
  }
  /**
   * Displays loading placeholders in the saved-tweets list.
   */
  function renderTweetSkeletons() {
    const listEl = document.getElementById("saved-tweets-list");
    if (!listEl)
      return;
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
  /**
   * Renders saved tweets in the saved-tweets list, or displays an empty-state message when no tweets are available.
   * @param {Array} items - The saved tweets to display.
   */
  function renderTweetList(items) {
    const listEl = document.getElementById("saved-tweets-list");
    if (!listEl)
      return;
    if (items.length === 0) {
      listEl.innerHTML = `
      <div class="empty-state">
        No saved tweets yet. Add a tweet from X to see it here.
      </div>
    `;
      return;
    }
    listEl.innerHTML = "";
    items.forEach((item, index) => {
      const el = buildTweetElement(item);
      el.style.animationDelay = `${Math.min(index, 8) * 40}ms`;
      listEl.appendChild(el);
    });
  }
  /**
   * Synchronize saved tweets with refreshed data while preserving optimistic entries during reconciliation.
   * @param {Array<Object>} items - The refreshed saved-tweet items.
   * @param {number} total - The total number of saved tweets.
   */
  function mergeSilent(items, total) {
    const listEl = document.getElementById("saved-tweets-list");
    if (!listEl)
      return;
    const prevKeys = new Set(cachedTweets.map(tweetKey));
    const nextKeys = new Set(items.map(tweetKey));
    const byTweetId = new Map(items.map((item) => [item.tweetId, item]));
    cachedTweets = cachedTweets.filter((item) => {
      if (!item.id.startsWith("local_"))
        return true;
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
    newcomers.reverse().forEach((item) => insertTweetElement(item, true));
    items.forEach((item) => {
      const node = listEl.querySelector(`[data-tweet-id="${CSS.escape(item.tweetId)}"]`);
      if (!node)
        return;
      if (node.dataset.id?.startsWith("local_") || node.dataset.id !== item.id) {
        const fresh = buildTweetElement(item, node.classList.contains("tweet-item-new"));
        node.replaceWith(fresh);
      }
    });
    cachedTweets = items;
    tweetTotal = total;
    updateTweetCount();
    if (items.length === 0) {
      renderTweetList([]);
      return;
    }
    listEl.querySelectorAll(".tweet-item").forEach((node) => {
      const id = node.dataset.id || "";
      const tweetId = node.dataset.tweetId || "";
      if (id.startsWith("local_"))
        return;
      if (!nextKeys.has(id) && !byTweetId.has(tweetId)) {
        node.remove();
      }
    });
  }
  /**
   * Loads saved tweets and updates the tweet list, count, and loading state.
   * @param {string} [mode="full"] - Whether to perform a full load or silently merge refreshed results.
   */
  async function loadSavedTweets(mode = "full") {
    const listEl = document.getElementById("saved-tweets-list");
    const refreshBtn = document.getElementById("refresh-btn");
    if (!listEl || tweetsLoading)
      return;
    tweetsLoading = true;
    if (mode === "full") {
      refreshBtn?.classList.add("is-spinning");
      renderTweetSkeletons();
    }
    try {
      const result = await getSavedTweets();
      const items = result.items;
      const total = result.pagination?.total ?? items.length;
      if (mode === "silent" && cachedTweets.length > 0) {
        mergeSilent(items, total);
      } else {
        cachedTweets = items;
        tweetTotal = total;
        updateTweetCount();
        renderTweetList(items);
      }
    } catch (err) {
      const code = err?.code;
      if (code === "UNAUTHENTICATED") {
        showSetupView();
        return;
      }
      if (mode === "full" || cachedTweets.length === 0) {
        tweetTotal = 0;
        updateTweetCount();
        const message = err instanceof Error ? err.message : "Unknown error";
        listEl.innerHTML = `
        <div class="empty-state">
          Couldn\u2019t load tweets. ${escapeHtml(message)}
        </div>
      `;
      }
    } finally {
      tweetsLoading = false;
      refreshBtn?.classList.remove("is-spinning");
    }
  }
  /**
   * Escapes HTML-sensitive characters in a string.
   * @param {string} value - The text to escape.
   * @return {string} The escaped text.
   */
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /**
   * Updates the settings modal with the current user's identity, email address, and avatar or profile initial.
   */
  function updateModalDetails() {
    const identityEl = document.getElementById("modal-identity");
    const emailEl = document.getElementById("modal-email");
    const avatarEl = document.getElementById("modal-avatar");
    const user = currentConfig.user;
    const name = [user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "Signed in";
    const email = user?.email || "";
    if (identityEl)
      identityEl.textContent = name;
    if (emailEl)
      emailEl.textContent = email || "\u2014";
    if (avatarEl) {
      const url = user?.profile?.avatarUrl;
      if (url) {
        avatarEl.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`;
      } else {
        const initial = (name || "?").charAt(0).toUpperCase();
        avatarEl.innerHTML = `<span class="profile-initial">${escapeHtml(initial)}</span>`;
      }
    }
  }
  /**
   * Resolves after the specified delay.
   * @param {number} ms - The delay duration in milliseconds.
   * @return {Promise<void>} A promise that resolves after the delay.
   */
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
