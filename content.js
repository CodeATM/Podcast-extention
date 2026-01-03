// SVG Icon for the microphone
const MIC_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <g>
    <path d="M12 2C9.243 2 7 4.243 7 7v6c0 2.757 2.243 5 5 5s5-2.243 5-5V7c0-2.757-2.243-5-5-5zm-3 7c0-1.654 1.346-3 3-3s3 1.346 3 3v6c0 1.654-1.346 3-3 3s-3-1.346-3-3V9zm11 4h-2c0 3.309-2.691 6-6 6s-6-2.691-6-6H4c0 3.998 3.019 7.311 6.837 7.915l-.82 2.46 1.896.632 1.05-3.151C12.639 20.938 12.32 20.957 12 20.957s-.639-.019-1.163-.093l1.05 3.151 1.896-.632-.82-2.46A8.006 8.006 0 0 0 20 13z"></path>
  </g>
</svg>
`;

const CHECK_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
    <g>
        <path d="M9.55 18.2L3.65 12.3 5.075 10.875 9.55 15.35 18.925 5.975 20.35 7.4Z"></path>
    </g>
</svg>
`;

// Utility to find the Tweet element from the button
function findAncestor(el, selector) {
    while ((el = el.parentElement) && !el.matches(selector));
    return el;
}

// Function to handle the injection
function injectButtons() {
    // Use a more specific selector to avoid duplicates
    // Look for action bars that haven't been processed yet
    const actionBars = document.querySelectorAll('div[role="group"]:not(.t2p-processed)');

    actionBars.forEach((bar) => {
        // Verify it's actually a tweet action bar by checking for tweet action buttons
        const hasLikeInfo = bar.querySelector('[data-testid="like"]') ||
            bar.querySelector('[aria-label*="like" i]') ||
            bar.querySelector('[aria-label*="Like" i]');
        const hasReplyInfo = bar.querySelector('[data-testid="reply"]') ||
            bar.querySelector('[aria-label*="reply" i]') ||
            bar.querySelector('[aria-label*="Reply" i]');
        const hasRetweetInfo = bar.querySelector('[data-testid="retweet"]') ||
            bar.querySelector('[aria-label*="retweet" i]') ||
            bar.querySelector('[aria-label*="Repost" i]');

        if (hasLikeInfo || hasReplyInfo || hasRetweetInfo) {
            // Mark as processed FIRST to prevent duplicates
            bar.classList.add('t2p-processed');

            // Check if button already exists (extra safety)
            if (bar.querySelector('.t2p-button')) {
                return;
            }

            const btn = document.createElement('button');
            btn.className = 't2p-button';
            btn.innerHTML = MIC_ICON;
            btn.setAttribute('aria-label', 'Save for Podcast');
            btn.title = 'Save for Podcast';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTweetClick(btn);
            });

            // Inject as the last item
            bar.appendChild(btn);
        }
    });
}

// Main Observer
const observer = new MutationObserver(() => {
    // Add a small delay to let DOM settle
    setTimeout(() => {
        injectButtons();
    }, 100);
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial run with delay
setTimeout(() => {
    injectButtons();
}, 1000);


async function handleTweetClick(btn) {
    try {
        console.log('🎯 Tweet button clicked, starting extraction...');
        
        // Find the tweet article - try multiple selectors
        let tweetArticle = findAncestor(btn, 'article[data-testid="tweet"]');
        if (!tweetArticle) {
            tweetArticle = findAncestor(btn, 'article');
        }
        if (!tweetArticle) {
            tweetArticle = findAncestor(btn, '[data-testid="tweet"]');
        }

        if (!tweetArticle) {
            console.error('❌ Could not find tweet article');
            alert('Could not find tweet. Please try again.');
            return;
        }

        console.log('✅ Tweet article found:', tweetArticle);

        // Extract tweet data
        const tweetData = getTweetData(tweetArticle);
        
        if (!tweetData) {
            console.error('❌ Failed to extract tweet data');
            alert('Failed to extract tweet data. Please try again.');
            return;
        }

        console.log('✅ Tweet data extracted successfully:', tweetData);

        // Show Modal
        showModal({
            tweetData,
            onConfirm: async (selectedOption) => {
                try {
                    console.log('💾 User selected option:', selectedOption);
                    await saveToQueue(tweetData, selectedOption);

                    // Visual feedback - success
                    const originalContent = btn.innerHTML;
                    btn.innerHTML = CHECK_ICON;
                    btn.classList.add('t2p-added');

                    setTimeout(() => {
                        btn.innerHTML = originalContent;
                        btn.classList.remove('t2p-added');
                    }, 2000);

                } catch (error) {
                    console.error('❌ Error in save confirmation:', error);
                    // Visual feedback - error
                    btn.style.color = '#f4212e';
                    setTimeout(() => {
                        btn.style.color = '';
                    }, 2000);
                }
            }
        });
    } catch (error) {
        console.error('❌ Error handling tweet click:', error);
        alert('An error occurred. Please try again.');
    }
}

function getTweetData(article) {
    console.log('🎯 Starting comprehensive tweet data extraction...');
    
    try {
        // Get tweet URL and extract ID
        const url = getTweetUrl(article);
        const tweetId = extractTweetId(url);
        
        // Create comprehensive tweet data structure
        const tweetData = {
            id: tweetId,
            captured_at: new Date().toISOString(),
            author: extractAuthorData(article),
            content: extractContentData(article),
            metrics: extractMetrics(article),
            context: extractContext(article, url),
            url: url,
            initial_tags: [], // Can be populated later or by user
            collector_note: "" // Can be added by user
        };

        console.log('🎯 Comprehensive tweet data extracted:', tweetData);
        return tweetData;

    } catch (error) {
        console.error('❌ Error extracting comprehensive tweet data:', error);
        return null;
    }
}

function extractTweetId(url) {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : `tweet_${Date.now()}`;
}

function extractAuthorData(article) {
    const author = {
        username: '',
        display_name: '',
        verified: false
    };

    try {
        // Extract username and display name
        const userNameElement = article.querySelector('[data-testid="User-Name"]');
        if (userNameElement) {
            // Display name
            const displayNameEl = userNameElement.querySelector('span');
            if (displayNameEl) {
                author.display_name = displayNameEl.innerText || displayNameEl.textContent || '';
            }
            
            // Username
            const usernameEl = userNameElement.querySelector('a[href*="/"]');
            if (usernameEl) {
                const href = usernameEl.getAttribute('href');
                if (href) {
                    author.username = href.replace('/', '').split('/')[0] || '';
                }
            }
        }

        // Check for verification badge
        const verifiedBadge = article.querySelector('[data-testid="icon-verified"]') ||
                             article.querySelector('svg[aria-label*="Verified"]') ||
                             article.querySelector('[aria-label*="Verified"]');
        author.verified = !!verifiedBadge;

        console.log('👤 Author data extracted:', author);
        return author;
    } catch (error) {
        console.error('❌ Error extracting author data:', error);
        return author;
    }
}

function extractContentData(article) {
    const content = {
        text: '',
        media: [],
        links: []
    };

    try {
        // Extract tweet text - comprehensive approach with multiple fallbacks
        let tweetText = '';
        
        // Primary method: Look for tweetText element
        const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
        if (tweetTextElement) {
            // Get all text nodes to avoid truncation
            const walker = document.createTreeWalker(
                tweetTextElement,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let textParts = [];
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.trim()) {
                    textParts.push(node.textContent);
                }
            }
            
            if (textParts.length > 0) {
                tweetText = textParts.join(' ').trim();
            }
            
            // Fallback to innerText if tree walker didn't work
            if (!tweetText) {
                tweetText = tweetTextElement.innerText || tweetTextElement.textContent || '';
            }
        }
        
        // Secondary method: Look for lang attribute elements (Twitter uses these for tweet content)
        if (!tweetText || tweetText.length < 10) {
            const langElements = article.querySelectorAll('[lang]:not([lang="en"]):not([lang=""]), [lang="en"]');
            for (const element of langElements) {
                // Skip if it's inside a quoted tweet or other nested content
                if (!element.closest('[data-testid="quoteTweet"]') && 
                    !element.closest('[data-testid="User-Name"]') &&
                    !element.closest('time')) {
                    
                    const text = element.innerText || element.textContent || '';
                    if (text && text.length > tweetText.length && text.length > 5) {
                        // Check if this looks like tweet content (not just metadata)
                        if (!text.match(/^(Show this thread|Replying to|Show replies|·|\d+[hms]|@\w+$)/)) {
                            tweetText = text;
                        }
                    }
                }
            }
        }
        
        // Tertiary method: Look for dir="auto" elements
        if (!tweetText || tweetText.length < 10) {
            const dirElements = article.querySelectorAll('div[dir="auto"], span[dir="auto"]');
            for (const element of dirElements) {
                // Skip if it's inside quoted tweet, user info, or other metadata
                if (!element.closest('[data-testid="quoteTweet"]') && 
                    !element.closest('[data-testid="User-Name"]') &&
                    !element.closest('time') &&
                    !element.closest('[role="group"]')) {
                    
                    const text = element.innerText || element.textContent || '';
                    if (text && text.length > tweetText.length && text.length > 10) {
                        // Additional filtering for tweet-like content
                        if (!text.match(/^(Show|Replying|@\w+$|\d+[hms]$|·$)/)) {
                            tweetText = text;
                        }
                    }
                }
            }
        }
        
        // Final fallback: Get the longest text content that looks like a tweet
        if (!tweetText || tweetText.length < 5) {
            const allTextElements = article.querySelectorAll('div, span, p');
            let longestText = '';
            
            for (const element of allTextElements) {
                if (!element.closest('[data-testid="quoteTweet"]') && 
                    !element.closest('[data-testid="User-Name"]') &&
                    !element.closest('time') &&
                    !element.closest('[role="group"]') &&
                    !element.querySelector('svg')) {
                    
                    const text = element.innerText || element.textContent || '';
                    if (text && text.length > longestText.length && text.length > 15) {
                        // Check if it looks like actual tweet content
                        if (!text.match(/^(Show|Replying|@\w+|·|\d+[hms]|Like|Reply|Repost)/i) &&
                            text.split(' ').length > 3) {
                            longestText = text;
                        }
                    }
                }
            }
            
            if (longestText) {
                tweetText = longestText;
            }
        }
        
        // Clean up the extracted text
        tweetText = tweetText
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .replace(/^[\s\n\r]+|[\s\n\r]+$/g, '')  // Trim
            .replace(/Show this thread$/, '')  // Remove common suffixes
            .replace(/Replying to @\w+/, '')  // Remove reply indicators
            .trim();
        
        content.text = tweetText;

        // Extract media URLs
        const mediaElements = article.querySelectorAll('img[src*="pbs.twimg.com"], video source, [data-testid="tweetPhoto"] img');
        mediaElements.forEach(media => {
            let mediaUrl = media.src || media.getAttribute('src');
            if (mediaUrl && !content.media.includes(mediaUrl)) {
                content.media.push(mediaUrl);
            }
        });

        // Extract links
        const linkElements = article.querySelectorAll('a[href]:not([href*="/status/"]):not([href*="twitter.com"]):not([href*="x.com"])');
        linkElements.forEach(link => {
            const href = link.href;
            if (href && href.startsWith('http') && !content.links.includes(href)) {
                content.links.push(href);
            }
        });

        console.log('📝 Content data extracted:', content);
        return content;
    } catch (error) {
        console.error('❌ Error extracting content data:', error);
        return content;
    }
}

function extractMetrics(article) {
    const metrics = {
        likes: 0,
        retweets: 0,
        replies: 0,
        views: 0
    };

    try {
        // Extract likes
        const likeButton = article.querySelector('[data-testid="like"]') || 
                          article.querySelector('[aria-label*="like" i]');
        if (likeButton) {
            const likeText = likeButton.getAttribute('aria-label') || likeButton.innerText || '';
            const likeMatch = likeText.match(/(\d+(?:,\d+)*)/);
            if (likeMatch) {
                metrics.likes = parseInt(likeMatch[1].replace(/,/g, '')) || 0;
            }
        }

        // Extract retweets
        const retweetButton = article.querySelector('[data-testid="retweet"]') || 
                             article.querySelector('[aria-label*="repost" i]') ||
                             article.querySelector('[aria-label*="retweet" i]');
        if (retweetButton) {
            const retweetText = retweetButton.getAttribute('aria-label') || retweetButton.innerText || '';
            const retweetMatch = retweetText.match(/(\d+(?:,\d+)*)/);
            if (retweetMatch) {
                metrics.retweets = parseInt(retweetMatch[1].replace(/,/g, '')) || 0;
            }
        }

        // Extract replies
        const replyButton = article.querySelector('[data-testid="reply"]') || 
                           article.querySelector('[aria-label*="repl" i]');
        if (replyButton) {
            const replyText = replyButton.getAttribute('aria-label') || replyButton.innerText || '';
            const replyMatch = replyText.match(/(\d+(?:,\d+)*)/);
            if (replyMatch) {
                metrics.replies = parseInt(replyMatch[1].replace(/,/g, '')) || 0;
            }
        }

        // Extract views (if available)
        const viewsElement = article.querySelector('[aria-label*="view" i]') ||
                            article.querySelector('[data-testid="app-text-transition-container"]');
        if (viewsElement) {
            const viewsText = viewsElement.getAttribute('aria-label') || viewsElement.innerText || '';
            const viewsMatch = viewsText.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)/i);
            if (viewsMatch) {
                metrics.views = parseMetricNumber(viewsMatch[1]) || 0;
            }
        }

        console.log('📊 Metrics extracted:', metrics);
        return metrics;
    } catch (error) {
        console.error('❌ Error extracting metrics:', error);
        return metrics;
    }
}

function parseMetricNumber(str) {
    if (!str) return 0;
    
    const num = parseFloat(str.replace(/,/g, ''));
    const multiplier = str.toLowerCase();
    
    if (multiplier.includes('k')) return Math.floor(num * 1000);
    if (multiplier.includes('m')) return Math.floor(num * 1000000);
    if (multiplier.includes('b')) return Math.floor(num * 1000000000);
    
    return Math.floor(num);
}

function extractContext(article, currentUrl) {
    const context = {
        is_reply: false,
        reply_to_id: null,
        reply_to_data: null, // Full parent tweet data
        is_quote: false,
        quoted_tweet_id: null,
        quoted_tweet_data: null, // Full quoted tweet data
        thread_position: 1
    };

    try {
        // Enhanced reply detection with multiple methods
        let isReply = false;
        let parentTweetId = null;
        let parentUsername = null;
        
        // Method 1: Look for "Replying to" text
        const replyElements = article.querySelectorAll('*');
        for (const element of replyElements) {
            const text = element.innerText || element.textContent || '';
            if (text.includes('Replying to') || text.includes('Reply to')) {
                isReply = true;
                
                // Extract username from the text
                const usernameMatch = text.match(/Replying to @(\w+)/);
                if (usernameMatch) {
                    parentUsername = usernameMatch[1];
                }
                
                // Look for parent tweet link in the same area
                const parentLink = element.querySelector('a[href*="/status/"]') ||
                                 element.parentElement?.querySelector('a[href*="/status/"]') ||
                                 element.closest('div')?.querySelector('a[href*="/status/"]');
                
                if (parentLink) {
                    parentTweetId = extractTweetId(parentLink.href);
                }
                break;
            }
        }
        
        // Method 2: Look for reply context in URL or page structure
        if (!isReply) {
            // Check if current URL indicates this is a reply
            const currentTweetId = extractTweetId(currentUrl);
            
            // Look for any status links that aren't the current tweet
            const statusLinks = article.querySelectorAll('a[href*="/status/"]');
            for (const link of statusLinks) {
                const linkTweetId = extractTweetId(link.href);
                if (linkTweetId && linkTweetId !== currentTweetId) {
                    // This might be a parent tweet
                    parentTweetId = linkTweetId;
                    
                    // Try to extract username from the link or surrounding context
                    const linkText = link.innerText || link.textContent || '';
                    const href = link.getAttribute('href') || '';
                    const usernameFromHref = href.match(/\/(\w+)\/status\//);
                    if (usernameFromHref) {
                        parentUsername = usernameFromHref[1];
                        isReply = true;
                        break;
                    }
                }
            }
        }
        
        // Method 3: Check for thread indicators or conversation context
        if (!isReply) {
            const threadIndicators = article.querySelectorAll('[data-testid*="conversation"], [data-testid*="thread"]');
            if (threadIndicators.length > 0) {
                // Look for parent tweet indicators in thread context
                const conversationLinks = article.querySelectorAll('a[href*="/status/"]');
                if (conversationLinks.length > 1) {
                    // Assume the first different tweet ID is the parent
                    const currentTweetId = extractTweetId(currentUrl);
                    for (const link of conversationLinks) {
                        const linkTweetId = extractTweetId(link.href);
                        if (linkTweetId && linkTweetId !== currentTweetId) {
                            parentTweetId = linkTweetId;
                            const href = link.getAttribute('href') || '';
                            const usernameFromHref = href.match(/\/(\w+)\/status\//);
                            if (usernameFromHref) {
                                parentUsername = usernameFromHref[1];
                                isReply = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // Set reply context if detected
        if (isReply && parentTweetId) {
            context.is_reply = true;
            context.reply_to_id = parentTweetId;
            
            // Create comprehensive parent tweet data
            if (parentUsername) {
                context.reply_to_data = {
                    id: parentTweetId,
                    captured_at: new Date().toISOString(),
                    author: {
                        username: parentUsername,
                        display_name: `@${parentUsername}`,
                        verified: false
                    },
                    content: {
                        text: '[Parent tweet - click to view full content]',
                        media: [],
                        links: []
                    },
                    metrics: {
                        likes: 0,
                        retweets: 0,
                        replies: 0,
                        views: 0
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
                    url: `https://x.com/${parentUsername}/status/${parentTweetId}`,
                    initial_tags: ['placeholder', 'parent'],
                    collector_note: 'Auto-extracted parent tweet placeholder'
                };
            }
        }

        // Check for quoted tweet and extract full data
        const quotedTweetElement = article.querySelector('[data-testid="quoteTweet"]');
        if (quotedTweetElement) {
            context.is_quote = true;
            console.log('📝 Found quoted tweet element, extracting full data...');
            
            // Extract quoted tweet data comprehensively
            const quotedData = extractQuotedTweetData(quotedTweetElement);
            if (quotedData) {
                context.quoted_tweet_id = quotedData.id;
                context.quoted_tweet_data = quotedData;
                console.log('✅ Quoted tweet data extracted:', quotedData);
            }
        }

        // Determine thread position (simplified - could be enhanced)
        if (context.is_reply) {
            // This is a rough estimation - could be improved with more analysis
            const threadIndicators = article.querySelectorAll('a[href*="/status/"]');
            context.thread_position = threadIndicators.length > 1 ? 2 : 1;
        }

        console.log('🔗 Context extracted:', context);
        return context;
    } catch (error) {
        console.error('❌ Error extracting context:', error);
        return context;
    }
}

function extractQuotedTweetData(quotedElement) {
    try {
        console.log('🔍 Extracting quoted tweet data from element:', quotedElement);
        
        const quotedData = {
            id: '',
            captured_at: new Date().toISOString(),
            author: {
                username: '',
                display_name: '',
                verified: false
            },
            content: {
                text: '',
                media: [],
                links: []
            },
            metrics: {
                likes: 0,
                retweets: 0,
                replies: 0,
                views: 0
            },
            context: {
                is_reply: false,
                reply_to_id: null,
                is_quote: false,
                quoted_tweet_id: null,
                thread_position: 1
            },
            url: '',
            initial_tags: ['quoted'],
            collector_note: 'Extracted from quoted tweet'
        };

        // Extract URL and ID
        const quotedLink = quotedElement.querySelector('a[href*="/status/"]');
        if (quotedLink) {
            quotedData.url = quotedLink.href;
            quotedData.id = extractTweetId(quotedLink.href);
        }

        // Extract author information
        const quotedUserElement = quotedElement.querySelector('[data-testid="User-Name"]');
        if (quotedUserElement) {
            // Display name
            const displayNameEl = quotedUserElement.querySelector('span');
            if (displayNameEl) {
                quotedData.author.display_name = displayNameEl.innerText || displayNameEl.textContent || '';
            }
            
            // Username
            const usernameEl = quotedUserElement.querySelector('a[href*="/"]');
            if (usernameEl) {
                const href = usernameEl.getAttribute('href');
                if (href) {
                    quotedData.author.username = href.replace('/', '').split('/')[0] || '';
                }
            }
        }

        // Check for verification in quoted tweet
        const quotedVerifiedBadge = quotedElement.querySelector('[data-testid="icon-verified"]') ||
                                   quotedElement.querySelector('svg[aria-label*="Verified"]');
        quotedData.author.verified = !!quotedVerifiedBadge;

        // Extract quoted tweet text
        const quotedTextElement = quotedElement.querySelector('[data-testid="tweetText"]') ||
                                 quotedElement.querySelector('[lang]') ||
                                 quotedElement.querySelector('div[dir="auto"]');
        if (quotedTextElement) {
            quotedData.content.text = quotedTextElement.innerText || quotedTextElement.textContent || '';
        }

        // Extract media from quoted tweet
        const quotedMediaElements = quotedElement.querySelectorAll('img[src*="pbs.twimg.com"], [data-testid="tweetPhoto"] img');
        quotedMediaElements.forEach(media => {
            const mediaUrl = media.src || media.getAttribute('src');
            if (mediaUrl && !quotedData.content.media.includes(mediaUrl)) {
                quotedData.content.media.push(mediaUrl);
            }
        });

        // Extract links from quoted tweet
        const quotedLinkElements = quotedElement.querySelectorAll('a[href]:not([href*="/status/"]):not([href*="twitter.com"]):not([href*="x.com"])');
        quotedLinkElements.forEach(link => {
            const href = link.href;
            if (href && href.startsWith('http') && !quotedData.content.links.includes(href)) {
                quotedData.content.links.push(href);
            }
        });

        // Extract timestamp from quoted tweet
        const quotedTimeElement = quotedElement.querySelector('time');
        if (quotedTimeElement) {
            const datetime = quotedTimeElement.getAttribute('datetime');
            if (datetime) {
                quotedData.captured_at = datetime;
            }
        }

        // Try to extract metrics from quoted tweet (these might not be available in the quoted display)
        // Most quoted tweets don't show metrics in the embedded view, but we'll try
        const quotedMetricElements = quotedElement.querySelectorAll('[aria-label*="like"], [aria-label*="repost"], [aria-label*="repl"]');
        quotedMetricElements.forEach(element => {
            const label = element.getAttribute('aria-label') || '';
            const match = label.match(/(\d+(?:,\d+)*)/);
            if (match) {
                const count = parseInt(match[1].replace(/,/g, '')) || 0;
                if (label.toLowerCase().includes('like')) {
                    quotedData.metrics.likes = count;
                } else if (label.toLowerCase().includes('repost') || label.toLowerCase().includes('retweet')) {
                    quotedData.metrics.retweets = count;
                } else if (label.toLowerCase().includes('repl')) {
                    quotedData.metrics.replies = count;
                }
            }
        });

        console.log('✅ Quoted tweet data extracted successfully:', quotedData);
        return quotedData;

    } catch (error) {
        console.error('❌ Error extracting quoted tweet data:', error);
        return null;
    }
}


function getTweetUrl(article) {
    // Try multiple methods to get the tweet URL
    const timeEl = article.querySelector('time');
    if (timeEl) {
        const link = timeEl.closest('a');
        if (link && link.href) {
            return link.href;
        }
    }

    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    if (statusLinks.length > 0) {
        return statusLinks[0].href;
    }

    const currentUrl = window.location.href;
    if (currentUrl.includes('/status/')) {
        return currentUrl;
    }

    return currentUrl; // Fallback
}

function showModal({ tweetData, onConfirm }) {
    if (!tweetData) {
        alert('Failed to extract tweet data. Please try again.');
        return;
    }

    // Remove existing modal if any
    const existing = document.querySelector('.t2p-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 't2p-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 't2p-modal';

    const title = document.createElement('h2');
    title.innerHTML = `<span class="t2p-modal-icon">🎙️</span>Save to Podcast Queue`;

    // Create comprehensive description
    const desc = document.createElement('div');
    desc.className = 't2p-tweet-preview';
    
    let contextInfo = '';
    if (tweetData.context.is_reply) {
        contextInfo += ' • Reply';
        if (tweetData.context.reply_to_data) {
            contextInfo += ` to @${tweetData.context.reply_to_data.author.username}`;
        }
    }
    if (tweetData.context.is_quote) {
        contextInfo += ' • Quote Tweet';
        if (tweetData.context.quoted_tweet_data) {
            contextInfo += ` from @${tweetData.context.quoted_tweet_data.author.username}`;
        }
    }
    if (tweetData.author.verified) {
        contextInfo += ' • Verified';
    }

    let quotedTweetPreview = '';
    if (tweetData.context.is_quote && tweetData.context.quoted_tweet_data) {
        const quotedData = tweetData.context.quoted_tweet_data;
        quotedTweetPreview = `
            <div class="t2p-quoted-preview">
                <div class="t2p-quoted-header">
                    <span class="t2p-quoted-label">📝 Quoted Tweet:</span>
                    <span class="t2p-quoted-author">@${quotedData.author.username} - ${quotedData.author.display_name}</span>
                </div>
                <div class="t2p-quoted-content">${quotedData.content.text}</div>
                ${quotedData.content.media.length > 0 ? `<div class="t2p-quoted-media">📷 ${quotedData.content.media.length} media file(s)</div>` : ''}
            </div>
        `;
    }

    desc.innerHTML = `
        <div class="t2p-tweet-header">
            <div class="t2p-user-info">
                <div class="t2p-display-name">${tweetData.author.display_name}</div>
                <div class="t2p-username">@${tweetData.author.username}${contextInfo}</div>
            </div>
        </div>
        <div class="t2p-tweet-content">${tweetData.content.text}</div>
        ${quotedTweetPreview}
        <div class="t2p-tweet-metrics">
            <span>❤️ ${tweetData.metrics.likes}</span>
            <span>🔄 ${tweetData.metrics.retweets}</span>
            <span>💬 ${tweetData.metrics.replies}</span>
            ${tweetData.metrics.views > 0 ? `<span>👁️ ${formatNumber(tweetData.metrics.views)}</span>` : ''}
        </div>
    `;

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 't2p-options';

    const createOption = (text, value, description) => {
        const opt = document.createElement('button');
        opt.className = 't2p-option-btn';
        
        const optText = document.createElement('div');
        optText.className = 't2p-option-text';
        optText.textContent = text;
        
        const optDesc = document.createElement('div');
        optDesc.className = 't2p-option-desc';
        optDesc.textContent = description;
        
        opt.appendChild(optText);
        opt.appendChild(optDesc);
        
        opt.onclick = () => {
            onConfirm(value);
            overlay.remove();
        };
        optionsContainer.appendChild(opt);
    }

    // Options based on tweet context
    createOption('Save tweet', 'single', 'Save this tweet to your podcast queue');
    
    if (tweetData.context.is_reply && tweetData.context.reply_to_data) {
        createOption('Save with parent context', 'with-parent', `Save this reply with embedded parent tweet data from @${tweetData.context.reply_to_data.author.username}`);
    }
    
    if (tweetData.context.is_quote && tweetData.context.quoted_tweet_data) {
        createOption('Save with quoted context', 'with-quote', `Save this tweet with embedded quoted tweet data from @${tweetData.context.quoted_tweet_data.author.username}`);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 't2p-cancel-btn';
    cancelBtn.innerHTML = '<span>Cancel</span>';
    cancelBtn.onclick = () => overlay.remove();

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(optionsContainer);
    modal.appendChild(cancelBtn);
    overlay.appendChild(modal);

    document.body.appendChild(overlay);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Chrome Storage Interface Functions
async function saveToQueue(tweetData, type) {
    try {
        console.log('💾 Starting save process...', { tweetData, type });
        
        // Get existing queue
        const data = await chrome.storage.local.get('podcastTweets');
        const tweets = data.podcastTweets || [];
        console.log('📚 Current tweets in storage:', tweets.length);

        // Check for duplicates
        const exists = tweets.some(existingTweet => existingTweet.id === tweetData.id);
        if (exists) {
            console.log('⚠️ Tweet already exists in queue:', tweetData.id);
            alert('Tweet already saved!');
            return;
        }

        // Add collector note based on type
        if (type === 'with-parent') {
            tweetData.collector_note = `Saved with parent tweet (reply chain)`;
            console.log('👆 Reply tweet saved with embedded parent data:', tweetData.context.reply_to_data);
        } else if (type === 'with-quote') {
            tweetData.collector_note = `Saved with quoted tweet`;
            console.log('📝 Quote tweet saved with embedded quoted data:', tweetData.context.quoted_tweet_data);
        } else {
            tweetData.collector_note = `Individual tweet capture`;
        }

        // Add the main tweet (with embedded parent/quoted data)
        tweets.push(tweetData);
        console.log('✅ Tweet added with embedded context data:', tweetData);

        // Save back to storage with new structure
        console.log('💾 Saving to storage...', tweets.length, 'tweets total');
        await chrome.storage.local.set({ podcastTweets: tweets });

        // Verify save
        const verifyData = await chrome.storage.local.get('podcastTweets');
        console.log('✅ Save verified:', verifyData.podcastTweets?.length, 'tweets in storage');

        console.log('✅ Tweet saved successfully:', tweetData.id);
        return tweetData;
    } catch (error) {
        console.error('❌ Failed to save tweet:', error);
        alert('Failed to save tweet. Please try again.');
        throw error;
    }
}

// Get queue from storage
async function getQueue() {
    try {
        const data = await chrome.storage.local.get('podcastTweets');
        return data.podcastTweets || [];
    } catch (error) {
        console.error('❌ Error loading tweets:', error);
        return [];
    }
}

// Clear entire queue
async function clearQueue() {
    try {
        await chrome.storage.local.set({ podcastTweets: [] });
        console.log('✅ Tweet queue cleared');
    } catch (error) {
        console.error('❌ Error clearing queue:', error);
        throw error;
    }
}
