#!/usr/bin/env python3
"""
Telegram Channel Fetcher - ImageKit CDN Version
Fetches posts from multiple Telegram channels and saves to JSON
FILTERS: Replies, Forwards, Duplicates, Old Posts, Short Text
Images uploaded to ImageKit CDN (20GB free storage + bandwidth)
"""

import json
import os
from datetime import datetime, timedelta
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
import asyncio
import requests
import base64

# Telegram API credentials
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
SESSION_STRING = os.getenv('TELEGRAM_SESSION', '')

# ImageKit credentials
IMAGEKIT_PRIVATE_KEY = os.getenv('IMAGEKIT_PRIVATE_KEY', '')
IMAGEKIT_URL_ENDPOINT = os.getenv('IMAGEKIT_URL_ENDPOINT', '')

# Get channels from environment variables
TRADING_CHANNELS_ENV = os.getenv('TELEGRAM_TRADING_CHANNELS', '')
AIRDROP_CHANNELS_ENV = os.getenv('TELEGRAM_AIRDROP_CHANNELS', '')

TRADING_CHANNELS = [ch.strip() for ch in TRADING_CHANNELS_ENV.split(',') if ch.strip()]
AIRDROP_CHANNELS = [ch.strip() for ch in AIRDROP_CHANNELS_ENV.split(',') if ch.strip()]

# Configuration
POSTS_PER_CHANNEL = 20  # Fetch 20 per channel (5 channels = 100 posts per category)
MAX_DAYS_OLD = 7
MIN_TEXT_LENGTH = 10
FILTER_FORWARDS = True

# Check credentials
if not API_ID or not API_HASH:
    print("❌ Missing Telegram API credentials!")
    exit(1)

if not IMAGEKIT_PRIVATE_KEY or not IMAGEKIT_URL_ENDPOINT:
    print("❌ Missing ImageKit credentials!")
    exit(1)

if not TRADING_CHANNELS and not AIRDROP_CHANNELS:
    print("❌ No channels specified!")
    exit(1)

def upload_to_imagekit(filepath, filename):
    """Upload image to ImageKit and return permanent URL"""
    try:
        with open(filepath, 'rb') as f:
            files = {'file': (filename, f)}
            data = {
                'fileName': filename,
                'folder': '/telegram'  # Organize in folder
            }
            
            response = requests.post(
                'https://upload.imagekit.io/api/v1/files/upload',
                files=files,
                data=data,
                auth=(IMAGEKIT_PRIVATE_KEY, ''),  # Private key as username, no password
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                url = data['url']
                file_id = data['fileId']
                print(f"    ✅ Uploaded to ImageKit: {url}")
                return {'url': url, 'fileId': file_id}
            else:
                print(f"    ❌ ImageKit upload failed: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        print(f"    ❌ Error uploading to ImageKit: {e}")
        return None

async def download_media(client, message, channel_name):
    """Download media from message, upload to ImageKit, and return URL"""
    if not message.media:
        return None
    
    try:
        # Create temp directory
        temp_dir = 'temp_telegram'
        os.makedirs(temp_dir, exist_ok=True)
        
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
                print(f"  ⏭️  Skipping video: {filename}")
                return None
            else:
                return None
        else:
            return None
        
        filepath = os.path.join(temp_dir, filename)
        
        # Download with 30-second timeout
        print(f"  📥 Downloading: {filename}")
        try:
            await asyncio.wait_for(
                client.download_media(message, filepath),
                timeout=30
            )
            
            # Upload to ImageKit
            result = upload_to_imagekit(filepath, filename)
            
            # Delete temp file
            try:
                os.remove(filepath)
            except:
                pass
            
            return result
                
        except asyncio.TimeoutError:
            print(f"  ⏱️  Timeout downloading {filename}, skipping")
            return None
        except Exception as e:
            print(f"  ❌ Error downloading {filename}: {e}")
            return None
    
    except Exception as e:
        print(f"  ❌ Error in download_media: {e}")
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
            
            # Download media if present and upload to ImageKit
            media_result = None
            if msg.media:
                media_result = await download_media(client, msg, channel_name)
            
            post = {
                'id': post_id,
                'messageId': msg.id,
                'channel': channel_name,
                'category': category,
                'text': msg.message or 'No text',
                'date': msg.date.isoformat(),
                'image': media_result['url'] if media_result else None,
                'imageFileId': media_result['fileId'] if media_result else None,  # For cleanup
                'imageData': None,  # No longer storing base64
                'video': None,
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
    print("🚀 Starting Telegram Channel Fetcher (ImageKit CDN)")
    print("=" * 60)
    print(f"📊 Trading Channels: {', '.join(TRADING_CHANNELS) if TRADING_CHANNELS else 'None'}")
    print(f"🎁 Airdrop Channels: {', '.join(AIRDROP_CHANNELS) if AIRDROP_CHANNELS else 'None'}")
    print(f"🔍 Filters: Replies, Forwards, Duplicates, Old Posts ({MAX_DAYS_OLD}d), Short Text")
    print(f"📤 Image Upload: ImageKit CDN (20GB free)")
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
    
    print(f"🔑 Session string length: {len(SESSION_STRING)} characters")
    
    try:
        session = StringSession(SESSION_STRING)
        print("✅ Session string parsed successfully")
    except Exception as e:
        print(f"❌ Invalid session string format: {e}")
        print(f"Session string preview: {SESSION_STRING[:50]}...")
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
        
        # Limit to 80 posts per category (160 total) - frontend will filter to 40 with images
        trading_posts = [p for p in all_posts if p.get('category') == 'trading'][:80]
        airdrop_posts = [p for p in all_posts if p.get('category') == 'airdrop'][:80]
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
        
        # Cleanup old images from ImageKit (older than 30 days)
        await cleanup_old_images(all_posts)
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await client.disconnect()

async def cleanup_old_images(current_posts):
    """Delete images from ImageKit that are older than 30 days"""
    try:
        print("\n🧹 Cleaning up old images from ImageKit...")
        
        # Get all file IDs from current posts
        current_file_ids = set()
        for post in current_posts:
            if post.get('imageFileId'):
                current_file_ids.add(post['imageFileId'])
        
        # List all files in ImageKit /telegram folder
        response = requests.get(
            'https://api.imagekit.io/v1/files',
            params={'path': '/telegram', 'limit': 1000},
            auth=(IMAGEKIT_PRIVATE_KEY, ''),
            timeout=30
        )
        
        if response.status_code == 200:
            files = response.json()
            deleted_count = 0
            
            for file in files:
                file_id = file['fileId']
                created_at = datetime.fromisoformat(file['createdAt'].replace('Z', '+00:00'))
                age_days = (datetime.now(created_at.tzinfo) - created_at).days
                
                # Delete if older than 30 days AND not in current posts
                if age_days > 30 and file_id not in current_file_ids:
                    delete_response = requests.delete(
                        f'https://api.imagekit.io/v1/files/{file_id}',
                        auth=(IMAGEKIT_PRIVATE_KEY, ''),
                        timeout=10
                    )
                    
                    if delete_response.status_code == 204:
                        deleted_count += 1
                        print(f"  🗑️  Deleted: {file['name']} (age: {age_days} days)")
            
            print(f"✅ Cleanup complete: Deleted {deleted_count} old images")
        else:
            print(f"⚠️  Could not list ImageKit files: {response.status_code}")
    
    except Exception as e:
        print(f"⚠️  Cleanup failed: {e}")

if __name__ == '__main__':
    asyncio.run(main())
