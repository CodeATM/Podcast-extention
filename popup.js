document.addEventListener('DOMContentLoaded', loadQueue);
document.getElementById('export-btn').addEventListener('click', exportQueue);
document.getElementById('clear-btn').addEventListener('click', clearQueue);

async function loadQueue() {
    try {
        const data = await chrome.storage.local.get('podcastTweets');
        const tweets = data.podcastTweets || [];

        updateCount(tweets.length);
        renderList(tweets);
        updateButtonStates(tweets.length > 0);
    } catch (error) {
        console.error('Error loading tweets:', error);
        updateCount(0);
        renderList([]);
        updateButtonStates(false);
    }
}

function updateCount(count) {
    const badge = document.getElementById('queue-count');
    badge.textContent = count;
    
    // Add animation when count changes
    badge.style.transform = 'scale(1.2)';
    setTimeout(() => {
        badge.style.transform = 'scale(1)';
    }, 200);
}

function updateButtonStates(hasItems) {
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    exportBtn.disabled = !hasItems;
    clearBtn.disabled = !hasItems;
}

function renderList(tweets) {
    const list = document.getElementById('queue-list');
    
    if (tweets.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2C9.243 2 7 4.243 7 7v6c0 2.757 2.243 5 5 5s5-2.243 5-5V7c0-2.757-2.243-5-5-5zm-3 7c0-1.654 1.346-3 3-3s3 1.346 3 3v6c0 1.654-1.346 3-3 3s-3-1.346-3-3V9zm11 4h-2c0 3.309-2.691 6-6 6s-6-2.691-6-6H4c0 3.998 3.019 7.311 6.837 7.915l-.82 2.46 1.896.632 1.05-3.151C12.639 20.938 12.32 20.957 12 20.957s-.639-.019-1.163-.093l1.05 3.151 1.896-.632-.82 2.46A8.006 8.006 0 0 0 20 13z"/>
                    </svg>
                </div>
                <h3>No tweets saved yet</h3>
                <p>Click the 🎙️ button on any tweet to start building your podcast queue</p>
            </div>
        `;
        return;
    }

    // Show latest first with staggered animation
    const sortedTweets = [...tweets].reverse();
    list.innerHTML = '';
    
    sortedTweets.forEach((tweet, index) => {
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.style.animationDelay = `${index * 0.05}s`;

        // Format Date and Time
        const date = new Date(tweet.captured_at);
        const formattedDate = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        });
        const formattedTime = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        // Create rich tweet display
        const tweetHeader = `
            <div class="tweet-header">
                <div class="tweet-user-info">
                    <div class="tweet-display-name">
                        ${tweet.author.display_name}
                        ${tweet.author.verified ? ' ✓' : ''}
                    </div>
                    <div class="tweet-username">@${tweet.author.username}</div>
                </div>
                <div class="tweet-time">${formattedDate}</div>
            </div>
        `;

        const tweetContent = tweet.content.text ? `
            <div class="tweet-content">${tweet.content.text}</div>
        ` : '';

        // Add context badges
        let contextInfo = '';
        if (tweet.context.is_reply) {
            contextInfo += `<span class="relationship-badge reply">↳ Reply</span>`;
        }
        if (tweet.context.is_quote) {
            contextInfo += `<span class="relationship-badge quote">📝 Quote</span>`;
        }
        if (tweet.initial_tags.includes('placeholder')) {
            contextInfo += `<span class="relationship-badge parent">📎 Placeholder</span>`;
        }

        // Show metrics
        const metricsInfo = `
            <div class="tweet-metrics">
                <span>❤️ ${formatNumber(tweet.metrics.likes)}</span>
                <span>🔄 ${formatNumber(tweet.metrics.retweets)}</span>
                <span>💬 ${formatNumber(tweet.metrics.replies)}</span>
                ${tweet.metrics.views > 0 ? `<span>👁️ ${formatNumber(tweet.metrics.views)}</span>` : ''}
            </div>
        `;

        // Truncate URL for display
        const displayUrl = tweet.url && tweet.url.length > 45 ? 
            tweet.url.substring(0, 42) + '...' : 
            (tweet.url || 'No URL');

        el.innerHTML = `
            ${tweetHeader}
            ${tweetContent}
            ${contextInfo ? `<div class="relationship-info">${contextInfo}</div>` : ''}
            ${metricsInfo}
            <a href="${tweet.url || '#'}" class="queue-url" title="${tweet.url || 'No URL'}">${displayUrl}</a>
            <div class="queue-meta">
                <span class="type-badge">${tweet.collector_note || 'Individual capture'}</span>
                <span class="queue-time">${formattedTime}</span>
            </div>
        `;
        
        // Add special styling for placeholder tweets
        if (tweet.initial_tags.includes('placeholder')) {
            el.classList.add('parent-tweet');
        }
        
        // Add click handler for opening in new tab
        const link = el.querySelector('.queue-url');
        if (link && tweet.url) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: tweet.url });
                
                // Add visual feedback
                el.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    el.style.transform = 'scale(1)';
                }, 150);
            });
        }
        
        list.appendChild(el);
    });
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

async function exportQueue() {
    const exportBtn = document.getElementById('export-btn');
    const originalText = exportBtn.innerHTML;
    
    try {
        // Show loading state
        exportBtn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" style="animation: spin 1s linear infinite;">
                <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>
            </svg>
            Exporting...
        `;
        exportBtn.disabled = true;

        const data = await chrome.storage.local.get('podcastTweets');
        const tweets = data.podcastTweets || [];

        if (tweets.length === 0) {
            showNotification('No tweets to export!', 'warning');
            return;
        }

        const exportData = {
            tweets: tweets,
            exported_at: new Date().toISOString(),
            total_tweets: tweets.length,
            metadata: {
                version: '4.0.0',
                source: 'Twitter Podcast Queue Extension - Professional',
                format: 'comprehensive_tweet_data'
            }
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `podcast-tweets-${timestamp}.json`;

        // Try using Chrome downloads API first
        try {
            await chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            });
            showNotification('Tweets exported successfully!', 'success');
            
            // Auto-clear queue after successful export
            await autoClearAfterExport();
            
        } catch (downloadError) {
            // Fallback: create download link
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification('Tweets exported successfully!', 'success');
            
            // Auto-clear queue after successful export
            await autoClearAfterExport();
        }
        
        // Clean up blob URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
    } catch (error) {
        console.error('Error exporting tweets:', error);
        showNotification('Failed to export tweets. Please try again.', 'error');
    } finally {
        // Restore button state
        setTimeout(() => {
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }, 1000);
    }
}

async function clearQueue() {
    const clearBtn = document.getElementById('clear-btn');
    const originalText = clearBtn.innerHTML;
    
    try {
        // Enhanced confirmation dialog
        const confirmed = confirm(`Are you sure you want to clear all ${document.getElementById('queue-count').textContent} tweets from your queue?\n\nThis action cannot be undone.`);
        
        if (!confirmed) return;

        // Show loading state
        clearBtn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" style="animation: spin 1s linear infinite;">
                <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/>
            </svg>
            Clearing...
        `;
        clearBtn.disabled = true;

        await chrome.storage.local.set({ podcastTweets: [] });
        await loadQueue(); // Reload to update display
        
        showNotification('Tweet queue cleared successfully!', 'success');
        
    } catch (error) {
        console.error('Error clearing queue:', error);
        showNotification('Failed to clear queue. Please try again.', 'error');
    } finally {
        // Restore button state
        setTimeout(() => {
            clearBtn.innerHTML = originalText;
            clearBtn.disabled = false;
        }, 1000);
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '600',
        fontSize: '14px',
        zIndex: '10000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    
    // Set background color based on type
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    notification.style.background = colors[type] || colors.info;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

async function autoClearAfterExport() {
    try {
        // Add a small delay to ensure export is complete
        setTimeout(async () => {
            // Clear the queue - use correct storage key
            await chrome.storage.local.set({ podcastTweets: [] });
            
            // Reload the popup to show empty state
            await loadQueue();
            
            // Show notification about auto-clear
            showNotification('Tweet queue cleared automatically after export', 'info');
        }, 1500);
        
    } catch (error) {
        console.error('Error auto-clearing queue:', error);
        // Don't show error notification for this - it's not critical
    }
}

// Add CSS for spin animation
const spinAnimationStyle = document.createElement('style');
spinAnimationStyle.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .tweet-metrics {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: hsl(215.4 16.3% 46.9%);
        margin: 8px 0;
    }
    
    .tweet-metrics span {
        display: flex;
        align-items: center;
        gap: 2px;
    }
`;
document.head.appendChild(spinAnimationStyle);