"use strict";
(() => {
  // src/oauth-capture.ts
  var path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/oauth/callback") {
    const query = new URLSearchParams(location.search);
    const error = query.get("error");
    if (error) {
      void chrome.runtime.sendMessage({
        action: "OAUTH_ERROR_CAPTURE",
        error,
        message: query.get("message") || error
      });
    } else if (location.hash) {
      void chrome.runtime.sendMessage({
        action: "OAUTH_FRAGMENT_CAPTURE",
        fragment: location.hash
      });
    }
  }
})();
