"use strict";
(() => {
  // src/auth/storage.ts
  var DEFAULT_BACKEND_URL = "http://localhost:5000";
  var STORAGE_KEYS = {
    accessToken: "tp_access_token",
    refreshToken: "tp_refresh_token",
    expiresAt: "tp_token_expires_at",
    backendUrl: "tp_backend_url",
    user: "tp_user",
    session: "tp_session",
    // legacy keys to clear on migrate
    legacyApiKey: "sonaraApiKey",
    legacyBackendUrl: "sonaraBackendUrl",
    legacyIdentity: "sonaraIdentity"
  };
  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result));
    });
  }
  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve();
      });
    });
  }
  function storageRemove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => resolve());
    });
  }
  async function migrateLegacyStorage() {
    const result = await storageGet([STORAGE_KEYS.backendUrl, STORAGE_KEYS.legacyBackendUrl]);
    if (!result[STORAGE_KEYS.backendUrl] && typeof result[STORAGE_KEYS.legacyBackendUrl] === "string") {
      const url = String(result[STORAGE_KEYS.legacyBackendUrl]).replace(/\/+$/, "");
      if (url)
        await storageSet({ [STORAGE_KEYS.backendUrl]: url });
    }
    await storageRemove([STORAGE_KEYS.legacyApiKey, STORAGE_KEYS.legacyIdentity, STORAGE_KEYS.legacyBackendUrl]);
  }
  async function getBackendUrl() {
    const result = await storageGet([STORAGE_KEYS.backendUrl, STORAGE_KEYS.legacyBackendUrl]);
    const url = typeof result[STORAGE_KEYS.backendUrl] === "string" && result[STORAGE_KEYS.backendUrl] || typeof result[STORAGE_KEYS.legacyBackendUrl] === "string" && result[STORAGE_KEYS.legacyBackendUrl] || DEFAULT_BACKEND_URL;
    return String(url).replace(/\/+$/, "");
  }
  async function setBackendUrl(backendUrl) {
    const clean = (backendUrl.trim() || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    await storageSet({ [STORAGE_KEYS.backendUrl]: clean });
    return clean;
  }
  async function loadAuthState() {
    const result = await storageGet([
      STORAGE_KEYS.accessToken,
      STORAGE_KEYS.refreshToken,
      STORAGE_KEYS.expiresAt,
      STORAGE_KEYS.backendUrl,
      STORAGE_KEYS.user,
      STORAGE_KEYS.session,
      STORAGE_KEYS.legacyBackendUrl
    ]);
    const accessToken = typeof result[STORAGE_KEYS.accessToken] === "string" ? result[STORAGE_KEYS.accessToken] : "";
    const refreshToken = typeof result[STORAGE_KEYS.refreshToken] === "string" ? result[STORAGE_KEYS.refreshToken] : "";
    const expiresAt = typeof result[STORAGE_KEYS.expiresAt] === "string" ? result[STORAGE_KEYS.expiresAt] : "";
    const backendUrl = await getBackendUrl();
    const tokens = accessToken && refreshToken ? {
      accessToken,
      refreshToken,
      expiresAt: expiresAt || (/* @__PURE__ */ new Date()).toISOString(),
      expiresIn: 900
    } : null;
    return {
      tokens,
      user: result[STORAGE_KEYS.user] || null,
      session: result[STORAGE_KEYS.session] || null,
      backendUrl
    };
  }
  async function saveAuthState(input) {
    const backendUrl = input.backendUrl ? input.backendUrl.replace(/\/+$/, "") : await getBackendUrl();
    await storageSet({
      [STORAGE_KEYS.accessToken]: input.tokens.accessToken,
      [STORAGE_KEYS.refreshToken]: input.tokens.refreshToken,
      [STORAGE_KEYS.expiresAt]: input.tokens.expiresAt,
      [STORAGE_KEYS.user]: input.user,
      [STORAGE_KEYS.session]: input.session,
      [STORAGE_KEYS.backendUrl]: backendUrl
    });
    await storageRemove([
      STORAGE_KEYS.legacyApiKey,
      STORAGE_KEYS.legacyIdentity
    ]);
  }
  async function clearAuthState() {
    await storageRemove([
      STORAGE_KEYS.accessToken,
      STORAGE_KEYS.refreshToken,
      STORAGE_KEYS.expiresAt,
      STORAGE_KEYS.user,
      STORAGE_KEYS.session,
      STORAGE_KEYS.legacyApiKey,
      STORAGE_KEYS.legacyIdentity
    ]);
  }
  async function getSonaraConfig() {
    const state = await loadAuthState();
    return {
      backendUrl: state.backendUrl,
      authenticated: Boolean(state.tokens),
      user: state.user,
      session: state.session
    };
  }
  function isAccessTokenExpired(expiresAt, skewMs = 6e4) {
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry))
      return true;
    return Date.now() >= expiry - skewMs;
  }

  // src/background.ts
  var refreshInFlight = null;
  var REFRESH_ALARM_NAME = "session-refresh";
  var ACCESS_TOKEN_TTL_MS = 15 * 60 * 1e3;
  var REFRESH_MARGIN_MS = 2 * 60 * 1e3;
  var REFRESH_CHECK_PERIOD_MINUTES = 5;
  function apiError(error, code) {
    return { success: false, error, code };
  }
  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  function validateApiPayload(body, requiredFields) {
    if (!body?.data || typeof body.data !== "object")
      return null;
    for (const field of requiredFields) {
      if (body.data[field] == null)
        return null;
    }
    return body.data;
  }
  async function login(email, password, backendUrl) {
    const baseUrl = backendUrl ? await setBackendUrl(backendUrl) : await getBackendUrl();
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        clientType: "extension",
        deviceName: "Chrome Extension"
      }),
      signal: AbortSignal.timeout(ACCESS_TOKEN_TTL_MS)
    });
    const body = await parseJson(response);
    if (!response.ok) {
      return apiError(body?.error?.message || "Login failed", body?.error?.code);
    }
    const data = validateApiPayload(body, ["accessToken", "refreshToken", "user", "session"]);
    if (!data) {
      return apiError("Invalid response from server", "INVALID_RESPONSE");
    }
    await persistAuthPayload(data, baseUrl);
    const config = await getSonaraConfig();
    return { success: true, config, authenticated: true };
  }
  async function persistAuthPayload(data, backendUrl) {
    const tokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : new Date(data.expiresAt).toISOString(),
      expiresIn: data.expiresIn
    };
    const user = {
      id: data.user.id,
      email: data.user.email,
      isActive: data.user.isActive,
      profile: data.user.profile ? {
        firstName: data.user.profile.firstName ?? null,
        lastName: data.user.profile.lastName ?? null,
        avatarUrl: data.user.profile.avatarUrl ?? null
      } : void 0
    };
    const session = {
      id: data.session.id,
      jti: data.session.jti,
      clientType: data.session.clientType,
      deviceName: data.session.deviceName,
      expiresAt: typeof data.session.expiresAt === "string" ? data.session.expiresAt : new Date(data.session.expiresAt).toISOString()
    };
    await saveAuthState({ tokens, user, session, backendUrl });
    maintainRefreshAlarm(true);
  }
  async function persistOAuthFragment(fragment, backendUrl) {
    const params = new URLSearchParams(fragment.replace(/^#/, ""));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const sessionRaw = params.get("session");
    const userRaw = params.get("user");
    const expiresAt = params.get("expiresAt");
    const expiresIn = params.get("expiresIn");
    if (!accessToken || !refreshToken || !sessionRaw || !userRaw) {
      return { ok: false, error: "Google sign-in did not return a complete session." };
    }
    try {
      const session = JSON.parse(sessionRaw);
      const user = JSON.parse(userRaw);
      await persistAuthPayload(
        {
          accessToken,
          refreshToken,
          expiresAt: expiresAt || new Date(Date.now() + 15 * 60 * 1e3).toISOString(),
          expiresIn: Number(expiresIn) || 900,
          session,
          user
        },
        backendUrl
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not persist the Google session." };
    }
  }
  async function finishOAuthTab(tabId, result) {
    if (typeof tabId === "number") {
      await chrome.tabs.remove(tabId).catch(() => void 0);
    }
    await chrome.runtime.sendMessage({
      action: result.ok ? "AUTH_OAUTH_COMPLETED" : "AUTH_OAUTH_FAILED",
      error: result.ok ? void 0 : result.error
    }).catch(() => void 0);
  }
  async function handleOAuthCaptureMessage(message, sender) {
    const backendUrl = await getBackendUrl();
    const tabId = sender.tab?.id;
    if (message.action === "OAUTH_ERROR_CAPTURE") {
      await chrome.runtime.sendMessage({
        action: "AUTH_OAUTH_FAILED",
        error: message.message || message.error || "Google sign-in failed"
      }).catch(() => void 0);
      if (typeof tabId === "number") {
        await chrome.tabs.remove(tabId).catch(() => void 0);
      }
      return { success: true };
    }
    const result = await persistOAuthFragment(message.fragment, backendUrl);
    await finishOAuthTab(tabId, result);
    return result.ok ? { success: true } : { success: false, error: result.error };
  }
  async function handleOAuthCallbackNavigation(tabId, url) {
    const backendUrl = await getBackendUrl();
    const origin = backendUrl.replace(/\/+$/, "");
    let target;
    try {
      target = new URL(url);
    } catch {
      return;
    }
    if (target.origin !== new URL(origin).origin)
      return;
    const path = target.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/oauth/callback")
      return;
    if (target.searchParams.get("error")) {
      await chrome.runtime.sendMessage({
        action: "AUTH_OAUTH_FAILED",
        error: target.searchParams.get("message") || target.searchParams.get("error")
      }).catch(() => void 0);
      await chrome.tabs.remove(tabId).catch(() => void 0);
      return;
    }
    const result = await persistOAuthFragment(target.hash, backendUrl);
    await finishOAuthTab(tabId, result);
  }
  async function refreshTokens() {
    if (refreshInFlight)
      return refreshInFlight;
    refreshInFlight = (async () => {
      const state = await loadAuthState();
      if (!state.tokens?.refreshToken)
        return null;
      try {
        const response = await fetch(`${state.backendUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: state.tokens.refreshToken }),
          signal: AbortSignal.timeout(ACCESS_TOKEN_TTL_MS)
        });
        const body = await parseJson(response);
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            await clearAuthState();
          }
          return null;
        }
        const data = validateApiPayload(body, ["accessToken", "refreshToken"]);
        if (!data) {
          console.warn("refreshTokens: invalid response payload");
          return null;
        }
        await persistAuthPayload(data, state.backendUrl);
        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : new Date(data.expiresAt).toISOString(),
          expiresIn: data.expiresIn
        };
      } catch {
        return null;
      }
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }
  async function getValidAccessToken() {
    const state = await loadAuthState();
    if (!state.tokens?.refreshToken)
      return null;
    if (!isAccessTokenExpired(state.tokens.expiresAt)) {
      return state.tokens.accessToken;
    }
    try {
      const refreshed = await refreshTokens();
      return refreshed?.accessToken ?? null;
    } catch {
      return null;
    }
  }
  async function recoverSession() {
    const state = await loadAuthState();
    if (!state.tokens?.refreshToken)
      return "unauthenticated";
    if (!isAccessTokenExpired(state.tokens.expiresAt)) {
      return "authenticated";
    }
    try {
      const refreshed = await refreshTokens();
      if (refreshed)
        return "authenticated";
      const currentState = await loadAuthState();
      if (!currentState.tokens?.refreshToken)
        return "unauthenticated";
      return "offline";
    } catch {
      return "offline";
    }
  }
  async function getSessionConfig() {
    const status = await recoverSession();
    if (status === "unauthenticated") {
      await clearAuthState();
      maintainRefreshAlarm(false);
    }
    const config = await getSonaraConfig();
    if (config.authenticated)
      maintainRefreshAlarm(true);
    return config;
  }
  function maintainRefreshAlarm(active) {
    if (typeof chrome.alarms === "undefined")
      return;
    if (!active) {
      void chrome.alarms.clear(REFRESH_ALARM_NAME);
      return;
    }
    chrome.alarms.get(REFRESH_ALARM_NAME, (existing) => {
      if (existing)
        return;
      chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: REFRESH_CHECK_PERIOD_MINUTES });
    });
  }
  async function refreshFromAlarm() {
    const state = await loadAuthState();
    if (!state.tokens) {
      maintainRefreshAlarm(false);
      return;
    }
    const msUntilExpiry = Date.parse(state.tokens.expiresAt) - Date.now();
    if (!Number.isNaN(msUntilExpiry) && msUntilExpiry > REFRESH_MARGIN_MS)
      return;
    try {
      await refreshTokens();
    } catch {
    }
  }
  async function logout() {
    const state = await loadAuthState();
    const accessToken = state.tokens?.accessToken;
    if (accessToken) {
      try {
        await fetch(`${state.backendUrl}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          signal: AbortSignal.timeout(ACCESS_TOKEN_TTL_MS)
        });
      } catch {
      }
    }
    await clearAuthState();
    maintainRefreshAlarm(false);
    return { success: true, authenticated: false, config: await getSonaraConfig() };
  }
  async function authenticatedFetch(path, method = "GET", body, retried = false) {
    const backendUrl = await getBackendUrl();
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      throw Object.assign(new Error("Not authenticated"), { code: "UNAUTHENTICATED" });
    }
    const response = await fetch(`${backendUrl}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    if (response.status === 401 && !retried) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        return authenticatedFetch(path, method, body, true);
      }
    }
    return response;
  }
  function mapTweetToSavePayload(tweet) {
    const safeHandle = (username, fallback = "unknown") => {
      const base = (username || "").trim().replace(/^@+/, "");
      const clean = base.replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);
      return clean ? `@${clean}` : `@${fallback}`;
    };
    const handle = safeHandle(tweet.author?.username);
    const displayName = (tweet.author?.display_name || handle).trim().slice(0, 100) || "Unnamed user";
    const text = (tweet.content?.text || "").trim();
    const rawSourceUrl = tweet.url;
    const sourceUrl = typeof rawSourceUrl === "string" && /^https?:\/\//.test(rawSourceUrl) ? rawSourceUrl : "";
    const mediaUrls = Array.isArray(tweet.content?.media) ? tweet.content.media.filter((m) => typeof m === "string" && /^https?:\/\//.test(m)) : [];
    const avatarUrl = tweet.author?.avatar_url;
    const authorAvatarUrl = typeof avatarUrl === "string" && /^https?:\/\//.test(avatarUrl) ? avatarUrl : void 0;
    const safeText = (text || sourceUrl).slice(0, 1e4);
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
        collector_note: tweet.collector_note
      }
    };
  }
  async function saveContent(tweet) {
    try {
      const response = await authenticatedFetch("/api/extension/save-content", "POST", mapTweetToSavePayload(tweet));
      const body = await parseJson(response);
      if (!response.ok) {
        return apiError(body?.error?.message || `Backend error (${response.status})`, body?.error?.code);
      }
      return {
        success: true,
        data: body.data
      };
    } catch (err) {
      return apiError(err?.message || "Network request failed", err?.code);
    }
  }
  async function handleMessage(message) {
    switch (message.action) {
      case "AUTH_LOGIN":
        return login(message.email, message.password, message.backendUrl);
      case "AUTH_LOGOUT":
        return logout();
      case "AUTH_STATUS":
      case "AUTH_GET_CONFIG": {
        const config = await getSessionConfig();
        return { success: true, config, authenticated: config.authenticated };
      }
      case "SET_BACKEND_URL": {
        await setBackendUrl(message.backendUrl);
        return { success: true, config: await getSonaraConfig() };
      }
      case "API_SAVE_CONTENT":
        return saveContent(message.tweet);
      case "API_FETCH": {
        try {
          const response = await authenticatedFetch(message.path, message.method || "GET", message.body);
          const data = await parseJson(response);
          if (!response.ok) {
            return apiError(data?.error?.message || `Request failed (${response.status})`, data?.error?.code);
          }
          return { success: true, data };
        } catch (err) {
          return apiError(err?.message || "Request failed", err?.code);
        }
      }
      case "TWEETS_UPDATED":
        return { success: true };
      default:
        return apiError("Unknown action");
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && (message.action === "OAUTH_FRAGMENT_CAPTURE" || message.action === "OAUTH_ERROR_CAPTURE")) {
      void handleOAuthCaptureMessage(message, sender).then(sendResponse).catch((err) => sendResponse(apiError(err?.message || "Unexpected error")));
      return true;
    }
    handleMessage(message).then(sendResponse).catch((err) => sendResponse(apiError(err?.message || "Unexpected error")));
    return true;
  });
  function enableSidePanel() {
    if (typeof chrome.sidePanel === "undefined")
      return;
    chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true }).catch((err) => console.warn("Side panel options:", err?.message || err));
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.warn("Side panel behavior:", err?.message || err));
  }
  async function openSidePanelForTab(tab) {
    if (typeof chrome.sidePanel === "undefined")
      return;
    try {
      const windowId = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
      if (typeof windowId === "number") {
        await chrome.sidePanel.open({ windowId });
      }
    } catch (err) {
      console.warn("Side panel open:", err?.message || err);
    }
  }
  enableSidePanel();
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
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      void handleOAuthCallbackNavigation(tabId, changeInfo.url);
    }
  });
})();
