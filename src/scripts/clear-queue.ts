// Temporary script to clear the old complex queue data
// Run this in the browser console on any Twitter/X page to clear old data

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.clear().then(() => {
    console.log('✅ Queue cleared! Old complex data removed.');
    console.log('Now try saving some tweets with the simplified extension.');
  });
}
