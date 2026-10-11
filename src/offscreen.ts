const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
let lastReported: boolean | null = null;

function report(force = false): void {
  const dark = prefersDark.matches;
  if (!force && dark === lastReported) return;
  lastReported = dark;
  void Promise.resolve(chrome.runtime.sendMessage({ type: 'SONARA_THEME', dark })).catch(() => undefined);
}

prefersDark.addEventListener('change', () => report());
window.setInterval(() => report(), 10000);
report(true);
