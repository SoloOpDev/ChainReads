#!/usr/bin/env python3
import json
import os
import requests
import time
import sys

def main():
    # Get environment variables
    api_url = "https://chainreads.pages.dev/api/telegram/update"
    update_secret = os.environ.get('TELEGRAM_UPDATE_SECRET')
    
    if not update_secret:
        print("❌ TELEGRAM_UPDATE_SECRET environment variable is missing")
        sys.exit(1)
    
    print(f"🎯 API Endpoint: {api_url}")
    
    # Load data file
    try:
        with open('telegram_posts.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("❌ telegram_posts.json not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        sys.exit(1)
    
    posts = data.get('results', [])
    
    if not posts:
        print("⚠️ No posts to send")
        return
    
    print(f"📤 Sending {len(posts)} posts...")
    
    # Send in batches
    BATCH_SIZE = 20
    total_batches = (len(posts) + BATCH_SIZE - 1) // BATCH_SIZE
    
    for i in range(0, len(posts), BATCH_SIZE):
        batch = posts[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        
        payload = {
            "secret": update_secret,
            "posts": batch
        }
        
        print(f"\n📦 Batch {batch_num}/{total_batches}: Sending {len(batch)} posts...")
        
        try:
            response = requests.post(
                api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                print(f"   ✅ Batch sent successfully")
            else:
                print(f"   ❌ Error: {response.text}")
                
        except Exception as e:
            print(f"   ❌ Request failed: {e}")
        
        # Small delay between batches
        if i + BATCH_SIZE < len(posts):
            time.sleep(1)
    
    print(f"\n✅ Upload complete!")

if __name__ == '__main__':
    main()