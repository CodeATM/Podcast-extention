// Debug script for reply detection
// Run this in browser console on a Twitter/X page with replies

console.log('🔍 Debug Reply Detection Script');

// Enable detailed debugging
window.debugTweetExtraction = true;

// Function to test reply detection on current page
function testReplyDetection() {
    const articles = document.querySelectorAll('article');
    console.log(`Found ${articles.length} tweet articles on page`);
    
    articles.forEach((article, index) => {
        console.log(`\n--- Testing Article ${index + 1} ---`);
        
        // Check for reply indicators
        const replySelectors = [
            '[data-testid="reply-to"]',
            '[data-testid="socialContext"]',
            'div[dir="ltr"]',
            'span[dir="ltr"]'
        ];
        
        replySelectors.forEach(selector => {
            const element = article.querySelector(selector);
            if (element) {
                const text = element.innerText || element.textContent || '';
                console.log(`  ${selector}: "${text}"`);
                
                if (text.includes('Replying to') || text.includes('Reply to') || text.match(/@\w+/)) {
                    console.log(`    ✅ This looks like a reply!`);
                    
                    // Check for links
                    const links = element.querySelectorAll('a[href*="/status/"]');
                    console.log(`    Found ${links.length} status links:`, Array.from(links).map(l => l.href));
                }
            }
        });
        
        // Check for quoted tweets
        const quotedTweet = article.querySelector('[data-testid="quoteTweet"]');
        if (quotedTweet) {
            console.log(`  ✅ Found quoted tweet`);
        }
        
        // Check all status links in article
        const allLinks = article.querySelectorAll('a[href*="/status/"]');
        console.log(`  Total status links: ${allLinks.length}`);
        allLinks.forEach((link, i) => {
            console.log(`    Link ${i + 1}: ${link.href}`);
        });
    });
}

// Run the test
testReplyDetection();

console.log('\n🎯 To test a specific tweet:');
console.log('1. Click the mic button on a reply tweet');
console.log('2. Check the console logs for detailed extraction info');
console.log('3. Look for "🔍 Looking for parent relationships" messages');