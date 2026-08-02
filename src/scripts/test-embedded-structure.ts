// Test script to verify the new embedded data structure
// Run this in browser console on Twitter/X after saving a reply tweet

console.log('🧪 Testing New Embedded Data Structure...');

/**
 * Tests the embedded tweet structure stored in Chrome local storage.
 *
 * Logs the total number of stored tweets and counts reply and quote tweets.
 */
export async function testEmbeddedStructure(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    console.warn('Chrome storage API not available in current scope');
    return;
  }

  try {
    const data = await chrome.storage.local.get('podcastTweets');
    const tweets = Array.isArray(data.podcastTweets) ? data.podcastTweets : [];
    
    console.log(`📊 Total tweets in storage: ${tweets.length}`);
    
    if (tweets.length === 0) {
      console.log('❌ No tweets found. Save a reply tweet first.');
      return;
    }
    
    const replyTweets = tweets.filter(tweet => tweet.context?.is_reply);
    console.log(`📝 Reply tweets found: ${replyTweets.length}`);
    
    if (replyTweets.length > 0) {
      const replyTweet = replyTweets[0];
      console.log('\n🎯 Testing Reply Tweet Structure:');
      console.log('Tweet ID:', replyTweet.id);
      console.log('Is Reply:', replyTweet.context.is_reply);
      console.log('Reply To ID:', replyTweet.context.reply_to_id);
    }
    
    const quoteTweets = tweets.filter(tweet => tweet.context?.is_quote);
    console.log(`📝 Quote tweets found: ${quoteTweets.length}`);
    
    console.log('\n✅ Embedded structure test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEmbeddedStructure();
(window as any).testEmbeddedStructure = testEmbeddedStructure;
