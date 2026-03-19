#!/usr/bin/env python3
"""
Manual Telegram Data Upload Script
Run this locally to bypass GitHub Actions issues
"""
import requests
import json
import os

def main():
    # You need to set this environment variable
    secret = os.environ.get('TELEGRAM_UPDATE_SECRET')
    if not secret:
        print("❌ Please set TELEGRAM_UPDATE_SECRET environment variable")
        print("Example: set TELEGRAM_UPDATE_SECRET=your_secret_here")
        return
    
    # Load the latest Telegram data (you'll need to run fetch_telegram_enhanced.py first)
    try:
        with open('telegram_posts.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("❌ telegram_posts.json not found!")
        print("Run fetch_telegram_enhanced.py first to generate the data")
        return
    
    posts = data.get('results', [])
    if not posts:
        print("⚠️ No posts found in telegram_posts.json")
        return
    
    print(f"📤 Uploading {len(posts)} posts to Cloudflare...")
    
    # Upload to API
    payload = {
        "secret": secret,
        "posts": posts
    }
    
    try:
        response = requests.post(
            "https://chainreads.pages.dev/api/telegram/update",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        print(f"📡 Status: {response.status_code}")
        print(f"📄 Response: {response.text}")
        
        if response.status_code == 200:
            print("✅ Upload successful!")
        else:
            print("❌ Upload failed!")
            
    except Exception as e:
        print(f"❌ Request failed: {e}")

if __name__ == '__main__':
    main()