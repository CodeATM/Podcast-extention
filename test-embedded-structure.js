// Test script to verify the new embedded data structure
// Run this in browser console on Twitter/X after saving a reply tweet

console.log('🧪 Testing New Embedded Data Structure...');

async function testEmbeddedStructure() {
    try {
        // Get current tweets from storage
        const data = await chrome.storage.local.get('podcastTweets');
        const tweets = data.podcastTweets || [];
        
        console.log(`📊 Total tweets in storage: ${tweets.length}`);
        
        if (tweets.length === 0) {
            console.log('❌ No tweets found. Save a reply tweet first.');
            return;
        }
        
        // Find reply tweets
        const replyTweets = tweets.filter(tweet => tweet.context.is_reply);
        console.log(`📝 Reply tweets found: ${replyTweets.length}`);
        
        if (replyTweets.length > 0) {
            const replyTweet = replyTweets[0];
            console.log('\n🎯 Testing Reply Tweet Structure:');
            console.log('Tweet ID:', replyTweet.id);
            console.log('Is Reply:', replyTweet.context.is_reply);
            console.log('Reply To ID:', replyTweet.context.reply_to_id);
            
            if (replyTweet.context.reply_to_data) {
                console.log('✅ Parent data embedded successfully:');
                console.log('  - Parent ID:', replyTweet.context.reply_to_data.id);
                console.log('  - Parent Username:', replyTweet.context.reply_to_data.author.username);
                console.log('  - Parent Display Name:', replyTweet.context.reply_to_data.author.display_name);
                console.log('  - Parent Text:', replyTweet.context.reply_to_data.content.text);
                console.log('  - Parent URL:', replyTweet.context.reply_to_data.url);
            } else {
                console.log('❌ No parent data found in reply tweet');
            }
        }
        
        // Find quote tweets
        const quoteTweets = tweets.filter(tweet => tweet.context.is_quote);
        console.log(`📝 Quote tweets found: ${quoteTweets.length}`);
        
        if (quoteTweets.length > 0) {
            const quoteTweet = quoteTweets[0];
            console.log('\n🎯 Testing Quote Tweet Structure:');
            console.log('Tweet ID:', quoteTweet.id);
            console.log('Is Quote:', quoteTweet.context.is_quote);
            console.log('Quoted Tweet ID:', quoteTweet.context.quoted_tweet_id);
            
            if (quoteTweet.context.quoted_tweet_data) {
                console.log('✅ Quoted data embedded successfully:');
                console.log('  - Quoted ID:', quoteTweet.context.quoted_tweet_data.id);
                console.log('  - Quoted Username:', quoteTweet.context.quoted_tweet_data.author.username);
                console.log('  - Quoted Display Name:', quoteTweet.context.quoted_tweet_data.author.display_name);
                console.log('  - Quoted Text:', quoteTweet.context.quoted_tweet_data.content.text);
                console.log('  - Quoted URL:', quoteTweet.context.quoted_tweet_data.url);
            } else {
                console.log('❌ No quoted data found in quote tweet');
            }
        }
        
        // Check for old-style separate parent tweets (should not exist)
        const parentTweets = tweets.filter(tweet => 
            tweet.initial_tags && tweet.initial_tags.includes('parent')
        );
        
        if (parentTweets.length > 0) {
            console.log(`⚠️ Found ${parentTweets.length} old-style parent tweets (should be 0)`);
            parentTweets.forEach(tweet => {
                console.log('  - Parent Tweet ID:', tweet.id, 'Username:', tweet.author.username);
            });
        } else {
            console.log('✅ No separate parent tweets found (correct behavior)');
        }
        
        // Generate sample export structure
        if (tweets.length > 0) {
            console.log('\n📋 Sample Export Structure:');
            const sampleExport = {
                tweets: tweets.slice(0, 1), // Just first tweet for example
                exported_at: new Date().toISOString(),
                total_tweets: tweets.length,
                metadata: {
                    version: '4.0.0',
                    source: 'Twitter Podcast Queue Extension - Professional',
                    format: 'comprehensive_tweet_data_embedded'
                }
            };
            console.log(JSON.stringify(sampleExport, null, 2));
        }
        
        console.log('\n✅ Embedded structure test completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Auto-run test
testEmbeddedStructure();

// Export for manual use
window.testEmbeddedStructure = testEmbeddedStructure;

console.log('\n💡 You can run the test again with: window.testEmbeddedStructure()');