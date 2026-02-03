#!/usr/bin/env node

/**
 * Quick script to grant points to a wallet address
 * Usage: node grant-points.js <wallet-address> [points]
 */

const walletAddress = process.argv[2];
const points = parseInt(process.argv[3] || '1000', 10);

if (!walletAddress) {
  console.error('❌ Error: Wallet address required');
  console.log('\nUsage: node grant-points.js <wallet-address> [points]');
  console.log('Example: node grant-points.js 0x123... 1000');
  process.exit(1);
}

// Get admin secret from env or use default
const adminSecret = process.env.ADMIN_SECRET || 'change-me-in-production';
const apiUrl = process.env.API_URL || 'http://localhost:3001';

console.log('🎁 Granting Points');
console.log('==================');
console.log(`Wallet: ${walletAddress}`);
console.log(`Points: ${points}`);
console.log(`API: ${apiUrl}`);
console.log('');

fetch(`${apiUrl}/api/admin/grant-points`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    walletAddress,
    points,
    adminSecret,
  }),
})
  .then(async (res) => {
    const data = await res.json();
    
    if (res.ok) {
      console.log('✅ Success!');
      console.log('');
      console.log(`Points Granted: ${data.pointsGranted}`);
      console.log(`New Balance: ${data.newBalance}`);
      console.log(`Message: ${data.message}`);
    } else {
      console.error('❌ Error:', data.error || data.message);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Request failed:', error.message);
    process.exit(1);
  });
