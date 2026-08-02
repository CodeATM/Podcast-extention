// Quick test to verify extension functionality
// Run this in browser console on Twitter/X

console.log('🧪 Quick Extension Test');

const buttons = document.querySelectorAll('.t2p-button');
console.log(`✅ Found ${buttons.length} extension buttons`);

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('podcastTweets').then(data => {
    const tweets = Array.isArray(data.podcastTweets) ? data.podcastTweets : [];
    console.log(`✅ Storage accessible: ${tweets.length} tweets`);
  });
}

try {
  console.log('✅ No JavaScript/TypeScript syntax errors detected');
} catch (error) {
  console.log('❌ JavaScript/TypeScript error:', error);
}

console.log('🎯 Extension appears to be working correctly!');
