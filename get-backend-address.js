// Quick script to get backend wallet address from private key
import { ethers } from 'ethers';

// Your backend private key from Railway
const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY || '0xYOUR_PRIVATE_KEY_HERE';

if (!privateKey || privateKey === '0xYOUR_PRIVATE_KEY_HERE') {
  console.error('❌ Please set BACKEND_WALLET_PRIVATE_KEY environment variable');
  console.error('\n💡 Run this command instead:');
  console.error('   $env:BACKEND_WALLET_PRIVATE_KEY="YOUR_KEY_HERE"; node get-backend-address.js\n');
  process.exit(1);
}

try {
  const wallet = new ethers.Wallet(privateKey);
  console.log('\n✅ Backend Wallet Address:', wallet.address);
  console.log('\n📋 Copy this address and use it to call setBackend() on your contract');
  console.log('   Contract: 0xE42C06F57dac0D1bd1c794e2c495504A9CcD28B5');
  console.log('   BaseScan: https://basescan.org/address/0xE42C06F57dac0D1bd1c794e2c495504A9CcD28B5#writeContract\n');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
