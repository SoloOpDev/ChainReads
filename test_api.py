#!/usr/bin/env python3
import requests
import json

# Test the Cloudflare API endpoint
url = "https://chainreads.pages.dev/api/telegram/update"

# Test payload
test_payload = {
    "secret": "test_secret",  # This will fail auth but test the URL
    "posts": [
        {
            "id": "test_1",
            "text": "Test post",
            "channel": "test_channel",
            "category": "trading"
        }
    ]
}

print(f"🧪 Testing API endpoint: {url}")

try:
    response = requests.post(
        url,
        json=test_payload,
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    
    print(f"📡 Status Code: {response.status_code}")
    print(f"📄 Response: {response.text}")
    
    if response.status_code == 401:
        print("✅ API is working! (401 = Invalid secret, which is expected)")
    elif response.status_code == 200:
        print("✅ API is working perfectly!")
    else:
        print("❌ API returned unexpected status")
        
except Exception as e:
    print(f"❌ API test failed: {e}")