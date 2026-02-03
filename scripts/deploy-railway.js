import { spawn } from 'child_process';

console.log('🚂 Railway Deployment Script');
console.log('==============================');

const DATABASE_URL = process.env.DATABASE_URL;

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: process.env
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function main() {
  // Check if DATABASE_URL is set
  if (DATABASE_URL) {
    console.log('✅ DATABASE_URL found - Running migrations...');
    
    try {
      // Run database migrations
      await runCommand('npx', ['drizzle-kit', 'push', '--force']);
      console.log('✅ Migrations complete');
    } catch (error) {
      console.log('⚠️  Migration failed, but continuing...');
      console.log(error.message);
    }
  } else {
    console.log('⚠️  No DATABASE_URL found - Using in-memory storage');
    console.log('💡 Add PostgreSQL in Railway dashboard to enable persistence');
    console.log('');
    console.log('To add PostgreSQL:');
    console.log('1. Go to Railway dashboard');
    console.log('2. Click "New" → "Database" → "Add PostgreSQL"');
    console.log('3. Redeploy your app');
    console.log('');
  }

  console.log('');
  console.log('🚀 Starting application...');
  
  // Start the application
  await runCommand('npm', ['run', 'start']);
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
