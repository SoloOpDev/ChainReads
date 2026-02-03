#!/usr/bin/env python3
"""Generate a new Telegram session string"""

import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

# Your API credentials
API_ID = 35523521
API_HASH = "038c13f03a772ed1e4e7bb6b9f200bb4"

async def main():
    print("🔐 Generating new Telegram session...")
    print("=" * 60)
    
    # Create client with empty session
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    
    await client.start()
    
    # Get the session string
    session_string = client.session.save()
    
    print("\n✅ Session generated successfully!")
    print("=" * 60)
    print("\n📋 Copy this session string:\n")
    print(session_string)
    print("\n=" * 60)
    print("\n⚠️  Update the TELEGRAM_SESSION secret in GitHub with this new string")
    print("⚠️  Also update your .env file with this new session")
    
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
