# NexVote

NexVote is a community-first, decision-centric platform where communities can create, discuss, and vote on real proposals that affect them. Instead of choosing representatives, people vote directly on policies and issues, with every decision recorded transparently and securely. It combines simple user experience, AI-assisted proposal management, and blockchain-based audit trails to make community decision-making clear, fair, and accountable.


## Features

- Blockchain voting on Ethereum Sepolia testnet
- Gasless transactions via relayer pattern
- AI-powered proposal summarization
- Multi-language support (6 languages: en, ta, hi, kn, ml, te)
- Semantic search with vector embeddings
- Community governance with role-based access
- Real-time voting results
- Admin dashboard for vote finalization

## Tech Stack

**Frontend**: Angular 17.3, TailwindCSS, Ethers.js  
**Backend**: Node.js, Express, PostgreSQL, Knex  
**AI Service**: Python 3.9+, FastAPI, Transformers, PyTorch  
**Blockchain**: Hardhat, Solidity 0.8.28, OpenZeppelin  
**Translation**: Helsinki-NLP Marian MT models

## Project Structure

```
nexvote/
  frontend/       Angular 17 standalone components
  backend/        Node.js Express API + relayer
  contracts/      Hardhat Solidity contracts
  ai/             FastAPI AI service (translation, summarization, embeddings)
  db/             Knex migrations and seeds
  scripts/        Build, start, test automation
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL 15+

### Installation

```bash
git clone https://github.com/ashwinsdk/nexvote.git
cd nexvote

# Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd contracts && npm install && cd ..
cd ai && pip install -r requirements.txt && cd ..
```

### Configuration

```bash
cp .env.example .env
# Edit .env with your database URL, API keys, Brevo SMTP credentials
```

### Database Setup

```bash
cd db
npx knex migrate:latest
npx knex seed:run
```

### Start Services

```bash
# Option 1: Local development
./scripts/start.sh

# Option 2: Docker
docker compose up --build

# Option 3: Manual
# Terminal 1: AI service
cd ai && ./run-fixed.sh

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Frontend
cd frontend && npx ng serve
```

Access the app at http://localhost:4200

## Environment Variables

Key variables (see .env.example for complete list):

```env
DATABASE_URL=postgres://nexvote:password@localhost:5432/nexvote_dev
JWT_SECRET=your-secret-key
AI_SERVICE_URL=http://localhost:8000
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
RELAYER_PRIVATE_KEY=0x_your_relayer_key
NEXVOTE_REGISTRY_ADDRESS=0x_deployed_contract

# Email (Brevo)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_KEY=xsmtpsib-your-key
```

## Deployed Contract

**NexVoteRegistry**: [0xf9839b6CaFa3130531b0a6fF632B4e85023a41DF](https://sepolia.etherscan.io/address/0xf9839b6CaFa3130531b0a6fF632B4e85023a41DF)

## Testing

```bash
# Backend
cd backend && npm test

# Contracts
cd contracts && npx hardhat test

# Frontend
cd frontend && ng test
```
