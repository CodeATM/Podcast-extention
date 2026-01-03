// Debug script for testing reply linking functionality
// Run this in browser console on a Twitter/X page with replies

console.log('🔍 Debug: Reply Linking Functionality');

// Function to test reply detection on current page
function debugReplyDetection() {
    console.log('\n🎯 Testing Reply Detection...');
    
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    console.log(`Found ${articles.length} tweet articles`);
    
    articles.forEach((article, index) => {
        console.log(`\n--- Tweet ${index + 1} ---`);
        
        // Test multiple reply detection methods
        let replyFound = false;
        let parentInfo = null;
        
        // Method 1: Look for "Replying to" text
        const allElements = article.querySelectorAll('*');
        for (const element of allElements) {
            const text = element.innerText || element.textContent || '';
            if (text.includes('Replying to') || text.includes('Reply to')) {
                replyFound = true;
                console.log('✅ Reply indicator found:', text);
                
                // Extract username
                const usernameMatch = text.match(/Replying to @(\w+)/);
                if (usernameMatch) {
                    console.log('👤 Parent username:', usernameMatch[1]);
                    parentInfo = { username: usernameMatch[1] };
                }
                
                // Look for parent link
                const parentLink = element.querySelector('a[href*="/status/"]') ||
                                 element.parentElement?.querySelector('a[href*="/status/"]');
                if (parentLink) {
                    const parentId = parentLink.href.match(/\/status\/(\d+)/)?.[1];
                    console.log('🔗 Parent tweet ID:', parentId);
                    console.log('🔗 Parent tweet URL:', parentLink.href);
                    if (parentInfo) {
                        parentInfo.id = parentId;
                        parentInfo.url = parentLink.href;
                    }
                }
                break;
            }
        }
        
        // Method 2: Check for multiple status links (conversation context)
        if (!replyFound) {
            const statusLinks = article.querySelectorAll('a[href*="/status/"]');
            console.log(`Found ${statusLinks.length} status links`);
            
            if (statusLinks.length > 1) {
                console.log('🔍 Multiple status links found - possible conversation:');
                statusLinks.forEach((link, i) => {
                    const tweetId = link.href.match(/\/status\/(\d+)/)?.[1];
                    const username = link.href.match(/\/(\w+)\/status\//)?.[1];
                    console.log(`  Link ${i + 1}: @${username} - ${tweetId}`);
                });
            }
        }
        
        // Method 3: Check URL structure
        const currentUrl = window.location.href;
        if (currentUrl.includes('/status/')) {
            console.log('📍 Current URL:', currentUrl);
            const currentTweetId = currentUrl.match(/\/status\/(\d+)/)?.[1];
            console.log('📍 Current tweet ID:', currentTweetId);
        }
        
        // Test tweet text extraction
        const textElement = article.querySelector('[data-testid="tweetText"]');
        if (textElement) {
            const text = textElement.innerText || textElement.textContent || '';
            console.log('📝 Tweet text:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        } else {
            console.log('❌ No tweet text element found');
        }
        
        // Test author extraction
        const userElement = article.querySelector('[data-testid="User-Name"]');
        if (userElement) {
            const displayName = userElement.querySelector('span')?.innerText || '';
            const usernameLink = userElement.querySelector('a[href*="/"]');
            const username = usernameLink ? usernameLink.getAttribute('href')?.replace('/', '').split('/')[0] : '';
            console.log('👤 Author:', displayName, `(@${username})`);
        }
        
        if (!replyFound) {
            console.log('ℹ️ No reply context detected');
        }
    });
}

// Function to test the extension's reply detection
function testExtensionReplyDetection() {
    console.log('\n🧪 Testing Extension Reply Detection...');
    
    // Find a tweet with microphone button
    const buttons = document.querySelectorAll('.t2p-button');
    if (buttons.length === 0) {
        console.log('❌ No extension buttons found');
        return;
    }
    
    console.log(`Found ${buttons.length} extension buttons`);
    
    // Test the first button
    const firstButton = buttons[0];
    const article = firstButton.closest('article[data-testid="tweet"]') || 
                   firstButton.closest('article');
    
    if (!article) {
        console.log('❌ Could not find tweet article for button');
        return;
    }
    
    console.log('🎯 Testing extension extraction on first tweet...');
    
    // Simulate the extension's extraction process
    try {
        // Test URL extraction
        const timeEl = article.querySelector('time');
        const url = timeEl ? timeEl.closest('a')?.href : window.location.href;
        console.log('🔗 Extracted URL:', url);
        
        // Test ID extraction
        const tweetId = url.match(/\/status\/(\d+)/)?.[1] || `tweet_${Date.now()}`;
        console.log('🆔 Extracted ID:', tweetId);
        
        // Test context extraction (simplified version of extension logic)
        const context = {
            is_reply: false,
            reply_to_id: null,
            reply_to_data: null
        };
        
        // Look for reply indicators
        const replyElements = article.querySelectorAll('*');
        for (const element of replyElements) {
            const text = element.innerText || element.textContent || '';
            if (text.includes('Replying to') || text.includes('Reply to')) {
                context.is_reply = true;
                
                const usernameMatch = text.match(/Replying to @(\w+)/);
                if (usernameMatch) {
                    const parentUsername = usernameMatch[1];
                    
                    // Look for parent link
                    const parentLink = element.querySelector('a[href*="/status/"]') ||
                                     element.parentElement?.querySelector('a[href*="/status/"]');
                    
                    if (parentLink) {
                        const parentId = parentLink.href.match(/\/status\/(\d+)/)?.[1];
                        context.reply_to_id = parentId;
                        context.reply_to_data = {
                            id: parentId,
                            url: parentLink.href,
                            author: {
                                username: parentUsername,
                                display_name: `@${parentUsername}`,
                                verified: false
                            }
                        };
                    }
                }
                break;
            }
        }
        
        console.log('🔗 Extracted context:', context);
        
        if (context.is_reply) {
            console.log('✅ Reply detected successfully!');
            console.log('👤 Parent username:', context.reply_to_data?.author?.username);
            console.log('🆔 Parent ID:', context.reply_to_id);
        } else {
            console.log('ℹ️ No reply context detected by extension logic');
        }
        
    } catch (error) {
        console.log('❌ Error in extension extraction test:', error);
    }
}

// Function to test storage operations
async function testStorageOperations() {
    console.log('\n💾 Testing Storage Operations...');
    
    try {
        // Test read
        const data = await chrome.storage.local.get('podcastTweets');
        console.log('✅ Storage read successful');
        console.log('Current tweets:', data.podcastTweets?.length || 0);
        
        // Test write (add a test tweet)
        const testTweet = {
            id: `test_${Date.now()}`,
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
            context: {
                is_reply: true,
                reply_to_id: 'parent123',
                reply_to_data: {
                    id: 'parent123',
                    author: {
                        username: 'parentuser',
                        display_name: 'Parent User'
                    }
                }
            },
            url: 'https://x.com/testuser/status/123456789',
            collector_note: 'Debug test tweet'
        };
        
        const tweets = data.podcastTweets || [];
        tweets.push(testTweet);
        
        await chrome.storage.local.set({ podcastTweets: tweets });
        console.log('✅ Storage write successful');
        
        // Verify write
        const verifyData = await chrome.storage.local.get('podcastTweets');
        console.log('✅ Storage verify successful:', verifyData.podcastTweets?.length);
        
        return true;
    } catch (error) {
        console.log('❌ Storage operation failed:', error);
        return false;
    }
}

// Function to simulate button click and modal interaction
function testModalInteraction() {
    console.log('\n🖱️ Testing Modal Interaction...');
    
    const buttons = document.querySelectorAll('.t2p-button');
    if (buttons.length === 0) {
        console.log('❌ No buttons found to test');
        return;
    }
    
    console.log('Clicking first button...');
    const firstButton = buttons[0];
    
    // Add event listener to catch any errors
    const originalError = window.onerror;
    window.onerror = function(msg, url, line, col, error) {
        console.log('❌ JavaScript error during click:', msg);
        return false;
    };
    
    try {
        firstButton.click();
        console.log('✅ Button click executed');
        
        // Check for modal after delay
        setTimeout(() => {
            const modal = document.querySelector('.t2p-modal-overlay');
            if (modal) {
                console.log('✅ Modal appeared');
                
                // Check modal content
                const options = modal.querySelectorAll('.t2p-option-btn');
                console.log(`Found ${options.length} modal options:`);
                options.forEach((option, i) => {
                    const text = option.querySelector('.t2p-option-text')?.textContent || option.textContent;
                    console.log(`  Option ${i + 1}: ${text}`);
                });
                
                // Close modal
                const cancelBtn = modal.querySelector('.t2p-cancel-btn');
                if (cancelBtn) {
                    setTimeout(() => {
                        cancelBtn.click();
                        console.log('✅ Modal closed');
                    }, 1000);
                }
            } else {
                console.log('❌ Modal did not appear');
            }
        }, 500);
        
    } catch (error) {
        console.log('❌ Button click failed:', error);
    } finally {
        window.onerror = originalError;
    }
}

// Run all debug tests
async function runDebugTests() {
    console.log('🚀 Starting Reply Linking Debug Tests...\n');
    
    debugReplyDetection();
    testExtensionReplyDetection();
    await testStorageOperations();
    testModalInteraction();
    
    console.log('\n✅ Debug tests completed!');
    console.log('\n💡 Manual test: Try clicking a microphone button on a reply tweet');
    console.log('💡 Check browser console for any error messages');
    console.log('💡 Open extension popup to see if tweets are being saved');
}

// Auto-run
runDebugTests();

// Export for manual use
window.debugReplyLinking = {
    runDebugTests,
    debugReplyDetection,
    testExtensionReplyDetection,
    testStorageOperations,
    testModalInteraction
};