// Debug script for testing reply linking functionality
// Run this in browser console on a Twitter/X page with replies

console.log('🔍 Debug: Reply Linking Functionality');

/**
 * Inspects tweet articles on the current page and logs reply context, tweet metadata, and available status links.
 */
export function debugReplyDetection(): void {
  console.log('\n🎯 Testing Reply Detection...');
  
  const articles = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');
  console.log(`Found ${articles.length} tweet articles`);
  
  articles.forEach((article, index) => {
    console.log(`\n--- Tweet ${index + 1} ---`);
    
    let replyFound = false;
    let parentInfo: any = null;
    
    const allElements = article.querySelectorAll<HTMLElement>('*');
    for (const element of Array.from(allElements)) {
      const text = element.innerText || element.textContent || '';
      if (text.includes('Replying to') || text.includes('Reply to')) {
        replyFound = true;
        console.log('✅ Reply indicator found:', text);
        
        const usernameMatch = text.match(/Replying to @(\w+)/);
        if (usernameMatch) {
          console.log('👤 Parent username:', usernameMatch[1]);
          parentInfo = { username: usernameMatch[1] };
        }
        
        const parentLink = element.querySelector<HTMLAnchorElement>('a[href*="/status/"]') ||
                           element.parentElement?.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
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
    
    if (!replyFound) {
      const statusLinks = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]');
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
    
    const currentUrl = window.location.href;
    if (currentUrl.includes('/status/')) {
      console.log('📍 Current URL:', currentUrl);
      const currentTweetId = currentUrl.match(/\/status\/(\d+)/)?.[1];
      console.log('📍 Current tweet ID:', currentTweetId);
    }
    
    const textElement = article.querySelector<HTMLElement>('[data-testid="tweetText"]');
    if (textElement) {
      const text = textElement.innerText || textElement.textContent || '';
      console.log('📝 Tweet text:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    } else {
      console.log('❌ No tweet text element found');
    }
    
    const userElement = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
    if (userElement) {
      const displayName = userElement.querySelector('span')?.innerText || '';
      const usernameLink = userElement.querySelector<HTMLAnchorElement>('a[href*="/"]');
      const username = usernameLink ? usernameLink.getAttribute('href')?.replace('/', '').split('/')[0] : '';
      console.log('👤 Author:', displayName, `(@${username})`);
    }
    
    if (!replyFound) {
      console.log('ℹ️ No reply context detected');
    }
  });
}

/**
 * Tests reply-context extraction for the first tweet containing an extension button.
 */
export function testExtensionReplyDetection(): void {
  console.log('\n🧪 Testing Extension Reply Detection...');
  
  const buttons = document.querySelectorAll<HTMLElement>('.t2p-button');
  if (buttons.length === 0) {
    console.log('❌ No extension buttons found');
    return;
  }
  
  console.log(`Found ${buttons.length} extension buttons`);
  
  const firstButton = buttons[0];
  const article = firstButton.closest<HTMLElement>('article[data-testid="tweet"]') || 
                 firstButton.closest<HTMLElement>('article');
  
  if (!article) {
    console.log('❌ Could not find tweet article for button');
    return;
  }
  
  console.log('🎯 Testing extension extraction on first tweet...');
  
  try {
    const timeEl = article.querySelector<HTMLElement>('time');
    const url = timeEl ? timeEl.closest<HTMLAnchorElement>('a')?.href || window.location.href : window.location.href;
    console.log('🔗 Extracted URL:', url);
    
    const tweetId = url.match(/\/status\/(\d+)/)?.[1] || `tweet_${Date.now()}`;
    console.log('🆔 Extracted ID:', tweetId);
    
    const context: any = {
      is_reply: false,
      reply_to_id: null,
      reply_to_data: null
    };
    
    const replyElements = article.querySelectorAll<HTMLElement>('*');
    for (const element of Array.from(replyElements)) {
      const text = element.innerText || element.textContent || '';
      if (text.includes('Replying to') || text.includes('Reply to')) {
        context.is_reply = true;
        
        const usernameMatch = text.match(/Replying to @(\w+)/);
        if (usernameMatch) {
          const parentUsername = usernameMatch[1];
          
          const parentLink = element.querySelector<HTMLAnchorElement>('a[href*="/status/"]') ||
                             element.parentElement?.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
          
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

/**
 * Tests access to locally stored podcast tweets and logs the number of stored entries.
 */
export async function testStorageOperations(): Promise<void> {
  console.log('\n💾 Testing Storage Operations...');
  
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const data = await chrome.storage.local.get('podcastTweets');
      const tweets = Array.isArray(data.podcastTweets) ? data.podcastTweets : [];
      console.log('✅ Storage read successful');
      console.log('Current tweets:', tweets.length);
    } catch (error) {
      console.error('❌ Storage test error:', error);
    }
  }
}

debugReplyDetection();
testExtensionReplyDetection();
