// Debug script to test tweet saving functionality
// Run this in browser console on Twitter/X to debug saving issues

console.log('🔧 Debug Tweet Saving Script');

export async function checkStorage(): Promise<any[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get('podcastTweets');
      const tweets = Array.isArray(data.podcastTweets) ? data.podcastTweets : [];
      console.log('📚 Current storage:', data);
      console.log('📊 Tweet count:', tweets.length);
      return tweets;
    }
    return [];
  } catch (error) {
    console.error('❌ Error checking storage:', error);
    return [];
  }
}

export async function clearStorage(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.clear();
      console.log('🧹 Storage cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing storage:', error);
  }
}

export async function testSave(): Promise<void> {
  const mockTweet = {
    id: 'test_' + Date.now(),
    captured_at: new Date().toISOString(),
    author: {
      username: 'testuser',
      display_name: 'Test User',
      verified: false
    },
    content: {
      text: 'This is a test tweet for debugging',
      media: [],
      links: []
    },
    metrics: {
      likes: 10,
      retweets: 5,
      replies: 2,
      views: 100
    },
    context: {
      is_reply: false,
      reply_to_id: undefined,
      reply_to_data: undefined,
      is_quote: false,
      quoted_tweet_id: undefined,
      quoted_tweet_data: undefined,
      thread_position: 1
    },
    url: 'https://x.com/testuser/status/123456789',
    initial_tags: ['test'],
    collector_note: 'Test tweet for debugging'
  };

  console.log('🧪 Testing save with mock tweet:', mockTweet);
  
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get('podcastTweets');
      const tweets = Array.isArray(result.podcastTweets) ? result.podcastTweets : [];
      tweets.push(mockTweet);
      await chrome.storage.local.set({ podcastTweets: tweets });
      console.log('✅ Mock tweet saved successfully');
    }
  } catch (error) {
    console.error('❌ Error saving mock tweet:', error);
  }
}

export async function runDiagnostics(): Promise<void> {
  console.log('\n🔍 Running diagnostics...');
  console.log('\n📚 Storage check:');
  await checkStorage();
  console.log('\n🧪 Testing save:');
  await testSave();
  console.log('\n📚 Storage after save:');
  await checkStorage();
}

(window as any).debugSaving = {
  checkStorage,
  clearStorage,
  testSave,
  runDiagnostics
};

runDiagnostics();
