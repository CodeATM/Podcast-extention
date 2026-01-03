// Debug script to test tweet saving functionality
// Run this in browser console on Twitter/X to debug saving issues

console.log('🔧 Debug Tweet Saving Script');

// Function to check current storage
async function checkStorage() {
    try {
        const data = await chrome.storage.local.get('podcastTweets');
        console.log('📚 Current storage:', data);
        console.log('📊 Tweet count:', data.podcastTweets?.length || 0);
        return data.podcastTweets || [];
    } catch (error) {
        console.error('❌ Error checking storage:', error);
        return [];
    }
}

// Function to clear storage for testing
async function clearStorage() {
    try {
        await chrome.storage.local.clear();
        console.log('🧹 Storage cleared');
    } catch (error) {
        console.error('❌ Error clearing storage:', error);
    }
}

// Function to test saving a mock tweet
async function testSave() {
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
            reply_to_id: null,
            reply_to_data: null,
            is_quote: false,
            quoted_tweet_id: null,
            quoted_tweet_data: null,
            thread_position: 1
        },
        url: 'https://x.com/testuser/status/123456789',
        initial_tags: ['test'],
        collector_note: 'Test tweet for debugging'
    };

    console.log('🧪 Testing save with mock tweet:', mockTweet);
    
    try {
        if (typeof saveToQueue === 'function') {
            await saveToQueue(mockTweet, 'single');
            console.log('✅ Mock tweet saved successfully');
        } else {
            console.log('❌ saveToQueue function not available');
        }
    } catch (error) {
        console.error('❌ Error saving mock tweet:', error);
    }
}

// Run diagnostics
async function runDiagnostics() {
    console.log('\n🔍 Running diagnostics...');
    
    // Check if extension functions are available
    console.log('Functions available:');
    console.log('  - saveToQueue:', typeof saveToQueue);
    console.log('  - getTweetData:', typeof getTweetData);
    console.log('  - extractContext:', typeof extractContext);
    
    // Check storage
    console.log('\n📚 Storage check:');
    await checkStorage();
    
    // Test save
    console.log('\n🧪 Testing save:');
    await testSave();
    
    // Check storage after save
    console.log('\n📚 Storage after save:');
    await checkStorage();
}

// Export functions for manual use
window.debugSaving = {
    checkStorage,
    clearStorage,
    testSave,
    runDiagnostics
};

console.log('\n🎯 Available debug functions:');
console.log('  - debugSaving.checkStorage() - Check current storage');
console.log('  - debugSaving.clearStorage() - Clear all storage');
console.log('  - debugSaving.testSave() - Test saving a mock tweet');
console.log('  - debugSaving.runDiagnostics() - Run full diagnostics');

// Auto-run diagnostics
runDiagnostics();