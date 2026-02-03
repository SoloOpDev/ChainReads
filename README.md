# ChainReads

Web3 news aggregation and rewards platform with cryptocurrency price predictions and token exchange.

## Features

- Real-time crypto news aggregation
- Telegram trading signals and airdrop alerts
- Educational blockchain content
- Price prediction markets
- Token rewards for engagement
- Web3 wallet integration
- Token exchange system

## Tech Stack

**Frontend**: React, TypeScript, Vite, TailwindCSS, ethers.js  
**Backend**: Node.js, Express, PostgreSQL, Drizzle ORM  
**Blockchain**: Solidity, Base Network, ERC-20

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run migrations
npm run db:push

# Start dev server
npm run dev
```

## Environment Setup

See `GITHUB_SECRETS.md` for required environment variables.

## Deployment

**Railway**: Connect repo, add PostgreSQL, set environment variables, deploy.

**GitHub Actions**: Automated Telegram updates run hourly.

## Project Structure

```
chainreads/
├── client/          # React frontend
├── server/          # Express backend
├── contracts/       # Solidity contracts
├── shared/          # Shared types
└── .github/         # CI/CD workflows
```

## API Endpoints

```
GET  /api/news                    # Latest crypto news
GET  /api/telegram/trading        # Trading signals
GET  /api/telegram/airdrop        # Airdrop alerts
GET  /api/academic                # Educational content
POST /api/claim-points            # Claim section rewards
POST /api/news/claim              # Claim article rewards
GET  /api/points/:address         # User balance
POST /api/predictions/bet         # Place prediction
POST /api/exchange/sign           # Get exchange signature
POST /api/admin/grant-points      # Grant points (admin)
```

## Smart Contracts

Deployed on Base network. Contract addresses configured via environment variables.

## License

MIT
