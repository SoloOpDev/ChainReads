#!/usr/bin/env node

/**
 * Quick test script to check Telegram API endpoints
 */

const BASE_URL = 'https://chainreads.pages.dev';

async function testEndpoint(path, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`📡 URL: ${BASE_URL}${path}`);
  
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    const status = response.status;
    
    console.log(`📊 Status: ${status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        console.log(`✅ Success: Returned ${data.length} items`);
        if (data.length > 0) {
          console.log(`📝 Sample: ${data[0].text?.substring(0, 100)}...`);
          console.log(`📅 Latest: ${data[0].date}`);
        } else {
          console.log(`⚠️  Empty array - no data yet`);
        }
      } else {
        console.log(`✅ Success: ${JSON.stringify(data).substring(0, 200)}...`);
      }
    } else {
      const text = await response.text();
      console.log(`❌ Error: ${text}`);
    }
  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Testing Telegram API Endpoints');
  console.log('==================================');
  
  // Test main endpoints
  await testEndpoint('/api/telegram/trading', 'Trading Posts');
  await testEndpoint('/api/telegram/airdrop', 'Airdrop Posts');
  
  // Test with limits
  await testEndpoint('/api/telegram/trading?limit=5', 'Trading Posts (Limited)');
  await testEndpoint('/api/telegram/airdrop?limit=5', 'Airdrop Posts (Limited)');
  
  console.log('\n==================================');
  console.log('🏁 Test Complete');
  console.log('\n💡 Next Steps:');
  console.log('1. If you see empty arrays, the API works but needs data');
  console.log('2. Run GitHub Actions workflow to fetch data');
  console.log('3. Check Cloudflare secrets are properly set');
  console.log('4. Verify D1 database migrations are applied');
}

main().catch(console.error);