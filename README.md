# Twitter Podcast Queue

A Chrome extension that helps you curate Twitter content for podcast creation with advanced relationship tracking and context preservation.

## 🎙️ Perfect for Podcasters

This extension is specifically designed for content creators who want to:
- **Tell Complete Stories**: Capture entire conversation threads, not just isolated tweets
- **Maintain Context**: Preserve reply chains, quote relationships, and thread structure
- **Reference Sources**: Export with full attribution, engagement data, and media references
- **Create Narratives**: Use conversation mapping to build compelling podcast segments

## ✨ Advanced Features

### 🔗 **Relationship Tracking**
- **Reply Detection**: Automatically identifies replies and captures parent tweet context
- **Quote Tweet Analysis**: Extracts quoted content and original author information  
- **Thread Recognition**: Detects multi-tweet threads with position tracking (e.g., "Thread 3/7")
- **Conversation Mapping**: Maps entire conversation chains for complete context
- **Reference Preservation**: Maintains links between related tweets for storytelling

### 📊 **Rich Data Extraction**
- Complete tweet metadata (text, author, timestamps, engagement metrics)
- User information (display name, username, avatar, verification status)
- Engagement data (likes, retweets, replies, views)
- Media detection (images, videos with thumbnails)
- Relationship context (reply-to, quoted tweets, thread position)

### 🎨 **Beautiful Interface**
- Shadcn-inspired design system with HSL colors
- Dark mode support with automatic theme switching
- Smooth animations and micro-interactions
- Relationship context visualization in modals
- Mobile-responsive design

### 📤 **Podcast-Ready Export**
- Structured JSON export with conversation chains
- Relationship mapping for easy script creation
- Chronological ordering with context preservation
- Conversation summary with statistics
- Full metadata for attribution and fact-checking

## How to Use

1. **Install the extension** from the Chrome Web Store
2. **Visit Twitter/X** - you'll see microphone (🎙️) buttons next to like/reply/retweet buttons
3. **Click the microphone** on any tweet you want to save
4. **Review the context** - the modal shows relationship information (replies, quotes, threads)
5. **Choose your option**:
   - Single tweets: "Add this tweet"
   - Threads: "Just this tweet", "Full thread", or "Thread context"
   - Conversations: "Just this tweet", "This + parent", "Full conversation", or "Conversation chain"
6. **Manage your queue** by clicking the extension icon - see rich tweet cards with relationship badges
7. **Export your queue** as structured JSON with conversation chains for podcast preparation

## 📋 Export Format

The extension exports comprehensive data perfect for podcast creation:

```json
{
  "podcastQueue": [
    {
      "url": "https://x.com/user/status/123",
      "text": "Tweet content...",
      "username": "username",
      "displayName": "Display Name",
      "avatar": "https://...",
      "timestamp": "2024-01-01T12:00:00Z",
      "relationships": {
        "isReply": true,
        "replyToUsername": "original_author",
        "replyToUrl": "https://x.com/original/status/456",
        "conversationId": "456",
        "rootTweetId": "456",
        "isThread": false,
        "isQuote": false,
        "quotedTweetText": "...",
        "threadPosition": { "current": 2, "total": 5 }
      },
      "metrics": {
        "likes": 150,
        "retweets": 45,
        "replies": 23,
        "views": 1200
      },
      "media": [
        { "type": "image", "url": "...", "alt": "..." }
      ]
    }
  ],
  "relationshipSummary": {
    "totalReplies": 5,
    "totalQuotes": 2,
    "totalThreads": 3,
    "conversationChains": {
      "456": {
        "rootTweetId": "456",
        "tweets": [...],
        "hasReplies": true,
        "hasQuotes": false,
        "isThread": true
      }
    }
  }
}
```

## Privacy

- All data is stored locally on your device
- No data is sent to external servers
- No tracking or analytics
- Open source code available for review

## Technical Details

- **Manifest V3** compliant
- **Vanilla JavaScript** - no external dependencies
- **Local Chrome Storage** for data persistence
- **MutationObserver** for dynamic content handling

## Support

If you encounter any issues or have suggestions, please report them on our GitHub repository.

## Version History

### 2.0.0 - Enhanced Relationship Tracking
- **Advanced Relationship Detection**: Reply chains, quote tweets, thread structure
- **Conversation Mapping**: Complete context preservation for podcast storytelling
- **Rich Data Export**: Comprehensive JSON with conversation chains and metadata
- **Enhanced UI**: Relationship context visualization and shadcn-inspired design
- **Podcast-Ready Features**: Structured data perfect for content creation

### 1.0.0 - Initial Release
- Tweet detection and saving
- Thread and conversation classification
- Export functionality
- Local storage management