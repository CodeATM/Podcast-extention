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
  /**
   * Retrieves values from local Chrome extension storage.
   * @param {*} keys - A storage key, array of keys, or key-to-defaults object.
   * @return {Object} The retrieved storage values.
   */
  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result));
    });
  }
  /**
   * Stores values in Chrome's local extension storage.
   * @param {Object} values - The key-value pairs to store.
   * @return {Promise<void>} Resolves when the values are stored; rejects if the storage operation fails.
   */
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
  /**
   * Removes the specified keys from local extension storage.
   * @param {string|string[]} keys - The storage key or keys to remove.
   */
  function storageRemove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => resolve());
    });
  }
  /**
   * Migrates the legacy backend URL to the current storage key and removes obsolete authentication data.
   */
  async function migrateLegacyStorage() {
    const result = await storageGet([STORAGE_KEYS.backendUrl, STORAGE_KEYS.legacyBackendUrl]);
    if (!result[STORAGE_KEYS.backendUrl] && typeof result[STORAGE_KEYS.legacyBackendUrl] === "string") {
      const url = String(result[STORAGE_KEYS.legacyBackendUrl]).replace(/\/+$/, "");
      if (url)
        await storageSet({ [STORAGE_KEYS.backendUrl]: url });
    }
    await storageRemove([STORAGE_KEYS.legacyApiKey, STORAGE_KEYS.legacyIdentity, STORAGE_KEYS.legacyBackendUrl]);
  }
  /**
   * Retrieves the configured backend URL.
   * @return {string} The backend URL without trailing slashes, or the default backend URL when none is configured.
   */
  async function getBackendUrl() {
    const result = await storageGet([STORAGE_KEYS.backendUrl, STORAGE_KEYS.legacyBackendUrl]);
    const url = typeof result[STORAGE_KEYS.backendUrl] === "string" && result[STORAGE_KEYS.backendUrl] || typeof result[STORAGE_KEYS.legacyBackendUrl] === "string" && result[STORAGE_KEYS.legacyBackendUrl] || DEFAULT_BACKEND_URL;
    return String(url).replace(/\/+$/, "");
  }
  /**
   * Set the backend URL used by the extension.
   * @param {string} backendUrl - The backend URL to store.
   * @return {Promise<string>} The trimmed backend URL without trailing slashes, or the default URL when empty.
   */
  async function setBackendUrl(backendUrl) {
    const clean = (backendUrl.trim() || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    await storageSet({ [STORAGE_KEYS.backendUrl]: clean });
    return clean;
  }
  /**
   * Loads the stored authentication state and backend configuration.
   * @returns {Promise<Object>} The authentication tokens, user, session, and backend URL.
   */
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
  /**
   * Persist authentication tokens, user data, session data, and backend configuration.
   * @param {Object} input - Authentication state to store.
   * @param {Object} input.tokens - Access token, refresh token, and expiration data.
   * @param {Object} input.user - Authenticated user information.
   * @param {Object} input.session - Current session information.
   * @param {string} [input.backendUrl] - Backend URL to store after removing trailing slashes.
   */
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
  /**
   * Clears stored authentication credentials and session data.
   */
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
  /**
   * Retrieves the current Sonara backend and authentication configuration.
   * @return {{backendUrl: string, authenticated: boolean, user: object|null, session: object|null}} The backend URL, authentication status, user, and session information.
   */
  async function getSonaraConfig() {
    const state = await loadAuthState();
    return {
      backendUrl: state.backendUrl,
      authenticated: Boolean(state.tokens),
      user: state.user,
      session: state.session
    };
  }
  /**
   * Determines whether an access token has expired or is within its safety window.
   * @param {string} expiresAt - The token expiration timestamp.
   * @param {number} [skewMs=60000] - The safety window in milliseconds.
   * @return {boolean} `true` if the timestamp is invalid or the token expires within the safety window, `false` otherwise.
   */
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
  /**
   * Creates a standardized failed API response.
   * @param {*} error - The error detail to include in the response.
   * @param {*} code - The error code associated with the failure.
   * @return {{success: false, error: *, code: *}} The failed API response.
   */
  function apiError(error, code) {
    return { success: false, error, code };
  }
  /**
   * Parses a response body as JSON.
   * @param {Response} response - The response whose body should be parsed.
   * @return {*} The parsed JSON value, or `null` if parsing fails.
   */
  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  /**
   * Authenticates a user and stores the resulting authentication state.
   * @param {string} backendUrl - Optional backend URL to use for the login request.
   * @return {Promise<Object>} The authentication result with configuration on success or an error response on failure.
   */
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
      })
    });
    const body = await parseJson(response);
    if (!response.ok) {
      return apiError(body?.error?.message || "Login failed", body?.error?.code);
    }
    const data = body.data;
    await persistAuthPayload(data, baseUrl);
    const config = await getSonaraConfig();
    return { success: true, config, authenticated: true };
  }
  /**
   * Persists authentication data and enables ongoing token refresh scheduling.
   * @param {Object} data - Authentication response containing token, user, and session data.
   * @param {string} backendUrl - Backend URL associated with the authenticated session.
   */
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
  /**
   * Refreshes the stored authentication tokens.
   * Concurrent refresh requests share the same in-flight operation. Invalid refresh authorization clears the stored authentication state.
   * @returns {{accessToken: string, refreshToken: string, expiresAt: string, expiresIn: *}|null} The refreshed token data, or `null` when no refresh token is available or refreshing fails.
   */
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
          body: JSON.stringify({ refreshToken: state.tokens.refreshToken })
        });
        const body = await parseJson(response);
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            await clearAuthState();
          }
          return null;
        }
        const data = body.data;
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
  /**
   * Retrieves a valid access token, refreshing it when expired.
   * @return {string|null} The valid access token, or `null` when no refresh token is available.
   */
  async function getValidAccessToken() {
    const state = await loadAuthState();
    if (!state.tokens?.refreshToken)
      return null;
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
  /**
   * Determines the current authentication status and attempts to restore an expired session.
   * @return {"authenticated"|"unauthenticated"|"offline"} The session status.
   */
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
  /**
   * Retrieves the current session configuration and updates authentication state accordingly.
   * @return {Promise<Object>} The current Sonara configuration, including authentication status.
   */
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
  /**
   * Maintains the periodic authentication token refresh alarm.
   * @param {boolean} active - Whether the refresh alarm should be enabled.
   */
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
  /**
   * Refreshes authentication tokens when the stored session is missing or nearing expiration.
   */
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
  /**
   * Logs out the current user and clears local authentication state.
   * @return {Promise<Object>} The unauthenticated status and current configuration.
   */
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
          }
        });
      } catch {
      }
    }
    await clearAuthState();
    maintainRefreshAlarm(false);
    return { success: true, authenticated: false, config: await getSonaraConfig() };
  }
  /**
   * Sends an authenticated JSON request to the configured backend.
   * @param {string} path - The backend request path.
   * @param {string} [method="GET"] - The HTTP method.
   * @param {*} [body] - The request body to serialize as JSON.
   * @returns {Promise<Response>} The backend response.
   * @throws {Error} An error with code `UNAUTHENTICATED` if no valid access token is available.
   */
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
  /**
   * Maps a tweet into the payload used to save its content.
   * @param {Object} tweet - The tweet data, including content, author, metrics, and metadata.
   * @return {Object} A sanitized save payload containing tweet content, author details, media, metrics, thread status, and metadata.
   */
  function mapTweetToSavePayload(tweet) {
    const safeHandle = (username, fallback = "unknown") => {
      const base = (username || "").trim().replace(/^@+/, "");
      const clean = base.replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);
      return clean ? `@${clean}` : `@${fallback}`;
    };
    const handle = safeHandle(tweet.author?.username);
    const displayName = (tweet.author?.display_name || handle).trim().slice(0, 100) || "Unnamed user";
    const text = (tweet.content?.text || "").trim();
    const sourceUrl = tweet.url;
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
  /**
   * Saves tweet content to the backend.
   * @param {Object} tweet - The tweet data to save.
   * @return {Object} A success result containing saved data, or an error result describing the failure.
   */
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
  /**
   * Handles runtime messages for authentication, configuration, API requests, and content updates.
   * @param {Object} message - The message containing an action and any action-specific data.
   * @returns {Promise<Object>} The result of the requested operation or a structured error response.
   */
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
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => sendResponse(apiError(err?.message || "Unexpected error")));
    return true;
  });
  /**
   * Enables the extension side panel and opens it when the extension action is clicked.
   */
  function enableSidePanel() {
    if (typeof chrome.sidePanel === "undefined")
      return;
    chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true }).catch((err) => console.warn("Side panel options:", err?.message || err));
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.warn("Side panel behavior:", err?.message || err));
  }
  /**
   * Opens the extension side panel for the specified tab's window.
   * @param {chrome.tabs.Tab} tab - The tab whose window should display the side panel.
   */
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
})();
