#!/usr/bin/env python3
"""
Telegram Channel Fetcher - ENHANCED VERSION
Fetches posts from multiple Telegram channels and saves to JSON
FILTERS: Replies, Forwards, Duplicates, Old Posts, Short Text
"""

import json
import os
from datetime import datetime, timedelta
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
import asyncio

# Telegram API credentials
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
SESSION_STRING = os.getenv('TELEGRAM_SESSION', '')

# Get channels from environment variables
TRADING_CHANNELS_ENV = os.getenv('TELEGRAM_TRADING_CHANNELS', '')
AIRDROP_CHANNELS_ENV = os.getenv('TELEGRAM_AIRDROP_CHANNELS', '')

TRADING_CHANNELS = [ch.strip() for ch in TRADING_CHANNELS_ENV.split(',') if ch.strip()]
AIRDROP_CHANNELS = [ch.strip() for ch in AIRDROP_CHANNELS_ENV.split(',') if ch.strip()]

# Configuration
POSTS_PER_CHANNEL = 10  # Reduced to 10 for faster GitHub Actions
MAX_DAYS_OLD = 7  # Only last 7 days
MIN_TEXT_LENGTH = 10
FILTER_FORWARDS = True

# Check credentials
if not API_ID or not API_HASH:
    print("❌ Missing Telegram API credentials!")
    exit(1)

if not TRADING_CHANNELS and not AIRDROP_CHANNELS:
    print("❌ No channels specified!")
    exit(1)

async def download_media(client, message, channel_name):
    """Download media from message and return local path"""
    if not message.media:
        return None
    
    try:
        telegram_dir = os.path.join('client', 'public', 'telegram')
        os.makedirs(telegram_dir, exist_ok=True)
        
        timestamp = int(message.date.timestamp())
        filename = f"{channel_name}_{message.id}_{timestamp}"
        
        if isinstance(message.media, MessageMediaPhoto):
            filename += '.jpg'
        elif isinstance(message.media, MessageMediaDocument):
            mime = message.media.document.mime_type
            if 'image' in mime:
                ext = mime.split('/')[-1]
                filename += f'.{ext}'
            elif 'video' in mime:
                filename += '.mp4'
            else:
                return None
        else:
            return None
        
        filepath = os.path.join(telegram_dir, filename)
        
        # Skip if already exists
        if os.path.exists(filepath):
            return f"/telegram/{filename}"
        
        # Download with timeout
        print(f"  📥 Downloading: {filename}")
        try:
            await asyncio.wait_for(
                client.download_media(message, filepath),
                timeout=10  # 10 second timeout per file
            )
            return f"/telegram/{filename}"
        except asyncio.TimeoutError:
            print(f"  ⏱️  Timeout downloading {filename}, skipping")
            return None
    
    except Exception as e:
        print(f"  ❌ Error downloading media: {e}")
        return None

async def fetch_channel_posts(client, channel_name, existing_ids, category):
    """Fetch posts from a single channel with enhanced filtering"""
    try:
        print(f"\n📱 Fetching from @{channel_name}...")
        
        # Verify channel exists and is accessible
        try:
            channel = await client.get_entity(channel_name)
            if not channel.broadcast:
                print(f"  ⚠️  {channel_name} is not a broadcast channel, skipping")
                return []
        except Exception as e:
            print(f"  ❌ Cannot access @{channel_name}: {e}")
            return []
        
        # Calculate cutoff date (timezone-aware)
        from datetime import timezone
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=MAX_DAYS_OLD)
        
        # Fetch messages
        messages = await client.get_messages(channel, limit=POSTS_PER_CHANNEL * 3)
        
        posts = []
        standalone_count = 0
        stats = {
            'replies': 0,
            'forwards': 0,
            'duplicates': 0,
            'too_old': 0,
            'too_short': 0,
            'empty': 0
        }
        
        for msg in messages:
            # FILTER 1: Skip replies
            if msg.reply_to:
                stats['replies'] += 1
                continue
            
            # FILTER 2: Skip forwarded messages (optional)
            if FILTER_FORWARDS and msg.fwd_from:
                stats['forwards'] += 1
                continue
            
            # FILTER 3: Skip duplicates
            post_id = f"{channel_name}_{msg.id}"
            if post_id in existing_ids:
                stats['duplicates'] += 1
                continue
            
            # FILTER 4: Skip old posts
            if msg.date < cutoff_date:
                stats['too_old'] += 1
                break  # Stop fetching older posts
            
            # FILTER 5: Skip empty content
            if not msg.message and not msg.media:
                stats['empty'] += 1
                continue
            
            # FILTER 6: Skip very short text-only posts
            if msg.message and not msg.media:
                if len(msg.message.strip()) < MIN_TEXT_LENGTH:
                    stats['too_short'] += 1
                    continue
            
            # Download media if present
            media_path = None
            if msg.media:
                media_path = await download_media(client, msg, channel_name)
            
            post = {
                'id': post_id,
                'messageId': msg.id,
                'channel': channel_name,
                'category': category,
                'text': msg.message or '',
                'date': msg.date.isoformat(),
                'image': media_path if media_path and ('.jpg' in media_path or '.png' in media_path or '.webp' in media_path) else None,
                'video': media_path if media_path and '.mp4' in media_path else None,
                'hasMedia': msg.media is not None,
                'views': msg.views or 0,
            }
            posts.append(post)
            existing_ids.add(post_id)  # Add to set to prevent duplicates
            standalone_count += 1
            
            # Stop when we have enough standalone posts
            if standalone_count >= POSTS_PER_CHANNEL:
                break
        
        # Print stats
        print(f"  ✅ Fetched {len(posts)} posts")
        if stats['replies'] > 0:
            print(f"     ⏭️  Filtered {stats['replies']} replies")
        if stats['forwards'] > 0:
            print(f"     ⏭️  Filtered {stats['forwards']} forwards")
        if stats['duplicates'] > 0:
            print(f"     ⏭️  Filtered {stats['duplicates']} duplicates")
        if stats['too_old'] > 0:
            print(f"     ⏭️  Filtered {stats['too_old']} old posts")
        if stats['too_short'] > 0:
            print(f"     ⏭️  Filtered {stats['too_short']} short posts")
        if stats['empty'] > 0:
            print(f"     ⏭️  Filtered {stats['empty']} empty posts")
        
        return posts
    
    except Exception as e:
        print(f"  ❌ Error fetching from @{channel_name}: {e}")
        return []

async def main():
    """Main function to fetch all channels"""
    print("🚀 Starting Telegram Channel Fetcher (ENHANCED)")
    print("=" * 60)
    print(f"📊 Trading Channels: {', '.join(TRADING_CHANNELS) if TRADING_CHANNELS else 'None'}")
    print(f"🎁 Airdrop Channels: {', '.join(AIRDROP_CHANNELS) if AIRDROP_CHANNELS else 'None'}")
    print(f"🔍 Filters: Replies, Forwards, Duplicates, Old Posts ({MAX_DAYS_OLD}d), Short Text")
    print("=" * 60)
    
    # Load existing posts to prevent duplicates
    existing_ids = set()
    if os.path.exists('telegram_posts.json'):
        try:
            with open('telegram_posts.json', 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
                existing_ids = {p['id'] for p in existing_data.get('results', [])}
            print(f"📋 Loaded {len(existing_ids)} existing post IDs")
        except Exception as e:
            print(f"⚠️  Could not load existing posts: {e}")
    
    # Create client with session string
    from telethon.sessions import StringSession
    
    if not SESSION_STRING:
        print("❌ TELEGRAM_SESSION is empty!")
        return
    
    try:
        session = StringSession(SESSION_STRING)
    except Exception as e:
        print(f"❌ Invalid session string: {e}")
        return
    
    client = TelegramClient(session, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            print("❌ Session not authorized!")
            return
        
        print("✅ Connected to Telegram\n")
        
        all_posts = []
        
        # Fetch trading channels
        if TRADING_CHANNELS:
            print("📊 Fetching Trading Channels...")
            for channel in TRADING_CHANNELS:
                posts = await fetch_channel_posts(client, channel, existing_ids, 'trading')
                all_posts.extend(posts)
                await asyncio.sleep(1)
        
        # Fetch airdrop channels
        if AIRDROP_CHANNELS:
            print("\n🎁 Fetching Airdrop Channels...")
            for channel in AIRDROP_CHANNELS:
                posts = await fetch_channel_posts(client, channel, existing_ids, 'airdrop')
                all_posts.extend(posts)
                await asyncio.sleep(1)
        
        # Sort by date (newest first)
        all_posts.sort(key=lambda x: x['date'], reverse=True)
        
        # Limit to 30 posts per category (60 total)
        trading_posts = [p for p in all_posts if p.get('category') == 'trading'][:30]
        airdrop_posts = [p for p in all_posts if p.get('category') == 'airdrop'][:30]
        all_posts = trading_posts + airdrop_posts
        
        # Save to JSON
        output = {
            'results': all_posts,
            'fetchedAt': datetime.now().isoformat(),
            'totalPosts': len(all_posts),
            'tradingChannels': TRADING_CHANNELS,
            'airdropChannels': AIRDROP_CHANNELS,
            'filters': {
                'replies': True,
                'forwards': FILTER_FORWARDS,
                'duplicates': True,
                'maxDaysOld': MAX_DAYS_OLD,
                'minTextLength': MIN_TEXT_LENGTH
            }
        }
        
        with open('telegram_posts.json', 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        print("\n" + "=" * 60)
        print(f"✅ Successfully fetched {len(all_posts)} posts")
        print(f"   📊 Trading: {len([p for p in all_posts if p.get('category') == 'trading'])} posts")
        print(f"   🎁 Airdrop: {len([p for p in all_posts if p.get('category') == 'airdrop'])} posts")
        print(f"📝 Saved to telegram_posts.json")
        print("=" * 60)
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
