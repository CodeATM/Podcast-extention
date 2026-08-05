"use strict";
(() => {
  // src/auth/storage.ts
  var DEFAULT_BACKEND_URL = "http://localhost:5000";

  // src/api.ts
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
  async function login(email, password, backendUrl) {
    return sendToBackground({ action: "AUTH_LOGIN", email, password, backendUrl });
  }
  async function logout() {
    return sendToBackground({ action: "AUTH_LOGOUT" });
  }
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
  async function initPanel() {
    setupEventListeners();
    registerTabListeners();
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
  function workspaceUrl(path = "/") {
    const base = (currentConfig.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }
  function openWorkspace(path = "/") {
    chrome.tabs.create({ url: workspaceUrl(path) });
  }
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
      openWorkspace("/api/auth/google?source=extension");
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
        return;
      }
      if (message?.action === "AUTH_OAUTH_COMPLETED") {
        void getSonaraConfig().then((config) => {
          currentConfig = config;
          if (config.authenticated)
            showDashboardView();
          else
            showSetupView();
        }).catch(() => showSetupView());
        return;
      }
      if (message?.action === "AUTH_OAUTH_FAILED") {
        showFeedback(message.error || "Google sign-in failed", "error");
        resetLoginButton();
      }
    });
  }
  function hideBoot() {
    document.getElementById("boot-view")?.classList.add("hidden");
  }
  function showSetupView() {
    hideBoot();
    document.getElementById("setup-view")?.classList.remove("hidden");
    document.getElementById("dashboard-view")?.classList.add("hidden");
    resetLoginButton();
  }
  function showDashboardView() {
    hideBoot();
    document.getElementById("setup-view")?.classList.add("hidden");
    document.getElementById("dashboard-view")?.classList.remove("hidden");
    void loadSavedTweets(cachedTweets.length ? "silent" : "full");
    updateModalDetails();
  }
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
  function showFeedback(msg, type) {
    const feedback = document.getElementById("setup-feedback");
    if (!feedback)
      return;
    feedback.textContent = msg;
    feedback.classList.remove("hidden", "success", "error");
    feedback.classList.add(type);
  }
  function isTwitterHost(hostname) {
    return hostname === "twitter.com" || hostname.endsWith(".twitter.com") || hostname === "x.com" || hostname.endsWith(".x.com");
  }
  async function checkActiveTab() {
    if (typeof chrome === "undefined" || !chrome.tabs)
      return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url)
        return;
      currentTabContext.url = tab.url;
      let tabIsTwitter = false;
      try {
        const urlObj = new URL(tab.url);
        currentTabContext.domain = urlObj.hostname.replace(/^www\./, "");
        tabIsTwitter = isTwitterHost(urlObj.hostname);
        currentTabContext.isTwitter = tabIsTwitter;
      } catch {
        currentTabContext.domain = "unknown";
        currentTabContext.isTwitter = false;
      }
      if (tab.id && tabIsTwitter) {
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
  function registerTabListeners() {
    if (typeof chrome === "undefined" || !chrome.tabs)
      return;
    chrome.tabs.onActivated.addListener(() => void checkActiveTab());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.status === "complete")
        void checkActiveTab();
    });
  }
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
  function tweetKey(item) {
    return item.id || item.tweetId;
  }
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
  function updateTweetCount() {
    const countEl = document.getElementById("tweet-count");
    if (countEl)
      countEl.textContent = String(tweetTotal);
  }
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
        currentConfig.authenticated = false;
        cachedTweets = [];
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
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
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
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
