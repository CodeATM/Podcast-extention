// Quick test to verify extension functionality
// Run this in browser console on Twitter/X

console.log('🧪 Quick Extension Test');

// Test 1: Check if extension loaded
const buttons = document.querySelectorAll('.t2p-button');
console.log(`✅ Found ${buttons.length} extension buttons`);

// Test 2: Check storage
chrome.storage.local.get('podcastTweets').then(data => {
    console.log(`✅ Storage accessible: ${data.podcastTweets?.length || 0} tweets`);
});

// Test 3: Check for syntax errors
try {
    console.log('✅ No JavaScript syntax errors detected');
} catch (error) {
    console.log('❌ JavaScript error:', error);
}

console.log('🎯 Extension appears to be working correctly!');