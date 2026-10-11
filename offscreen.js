"use strict";
(() => {
  // src/offscreen.ts
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  var lastReported = null;
  function report(force = false) {
    const dark = prefersDark.matches;
    if (!force && dark === lastReported)
      return;
    lastReported = dark;
    void Promise.resolve(chrome.runtime.sendMessage({ type: "SONARA_THEME", dark })).catch(() => void 0);
  }
  prefersDark.addEventListener("change", () => report());
  window.setInterval(() => report(), 1e4);
  report(true);
})();
