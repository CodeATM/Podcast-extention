// Script to clear old data format and prepare for new comprehensive format
// Run this in browser console on Twitter/X to clear old data

console.log('🧹 Clearing old tweet data formats...');

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.clear().then(() => {
    console.log('✅ All old data cleared!');
    console.log('🎯 Ready for new comprehensive tweet format');
    console.log('📊 New format includes:');
    console.log('  - Complete author info (username, display_name, verified)');
    console.log('  - Rich content (text, media URLs, links)');
    console.log('  - Full metrics (likes, retweets, replies, views)');
    console.log('  - Context info (is_reply, is_quote, thread_position)');
    console.log('  - Professional metadata (tags, collector_note)');
    console.log('');
    console.log('🎙️ Try saving some tweets now!');
  });
}
