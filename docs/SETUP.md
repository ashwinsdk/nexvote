# NexVote Setup Guide

Complete installation and deployment guide for NexVote platform.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Database Configuration](#database-configuration)
4. [Email Configuration](#email-configuration)
5. [AI Service Deployment](#ai-service-deployment)
6. [Blockchain Configuration](#blockchain-configuration)
7. [Docker Deployment](#docker-deployment)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- Node.js 18.0 or higher
- Python 3.9 or higher
- PostgreSQL 15 or higher
- Git
- MetaMask wallet extension

### Install Node.js

macOS:
```bash
brew install node@18
```

Ubuntu/Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install Python

macOS:
```bash
brew install python@3.11
```

Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install python3.11 python3.11-venv python3-pip
```

### Install PostgreSQL

macOS:
```bash
brew install postgresql@15
brew services start postgresql@15
```

Ubuntu/Debian:
```bash
sudo apt-get install postgresql-15 postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/ashwinsdk/nexvote.git
cd nexvote
```

### 2. Install Dependencies

Backend:
```bash
cd backend
npm install
cd ..
```

Frontend:
```bash
cd frontend
npm install
cd ..
```

Database:
```bash
cd db
npm install
cd ..
```

Contracts:
```bash
cd contracts
npm install
cd ..
```

AI Service:
```bash
cd ai
pip3 install -r requirements.txt
cd ..
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit .env with your configuration:
```env
DATABASE_URL=postgres://nexvote:nexvote_dev@localhost:5432/nexvote_dev
JWT_SECRET=change-to-random-64-char-string
AI_SERVICE_URL=http://localhost:8000
AI_API_KEY=change-me-ai-api-key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
RELAYER_PRIVATE_KEY=0x_your_relayer_wallet_private_key
NEXVOTE_REGISTRY_ADDRESS=0xf9839b6CaFa3130531b0a6fF632B4e85023a41DF
```

---

## Database Configuration

### 1. Create Database

```bash
psql postgres
```

In psql:
```sql
CREATE USER nexvote WITH PASSWORD 'nexvote_dev';
CREATE DATABASE nexvote_dev OWNER nexvote;
\q
```

### 2. Run Migrations

```bash
cd db
npx knex migrate:latest --knexfile knexfile.js
```

Expected output:
```
Using environment: development
Batch 1 run: 3 migrations
20250211000001_create_core_tables.js
20250211000002_add_private_communities.js
20260212000003_add_translation_columns.js
```

### 3. Seed Database (Optional)

```bash
npx knex seed:run --knexfile knexfile.js
cd ..
```

### 4. Verify Database

```bash
psql nexvote_dev -U nexvote
```

In psql:
```sql
\dt
SELECT COUNT(*) FROM users;
\q
```

---

## Email Configuration

### 1. Create Brevo Account

1. Visit https://www.brevo.com
2. Sign up for free account
3. Verify your email
4. Navigate to Settings -> SMTP & API

### 2. Get SMTP Credentials

From Brevo dashboard:
- SMTP Server: smtp-relay.brevo.com
- Port: 587
- Login: Your Brevo account email
- SMTP Key: Generate new key from dashboard

### 3. Update .env

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_KEY=xsmtpsib-your-actual-smtp-key-here
EMAIL_FROM=noreply@nexvote.app
EMAIL_FROM_NAME=NexVote
```

### 4. Install Email Dependencies

```bash
cd backend
npm install nodemailer @types/nodemailer
cd ..
```

### 5. Test Email Service

```bash
cd backend
npm run dev
```

Try registering a new user - you should receive verification email.

---

## AI Service Deployment

### Option 1: Local Development

```bash
cd ai
./run-fixed.sh
```

Service will be available at http://localhost:8000

### Option 2: HuggingFace Spaces (Free)

#### Setup

```bash
pip install huggingface_hub
huggingface-cli login
```

#### Create Space

Via web: https://huggingface.co/new-space
- Space name: nexvote-ai
- SDK: Docker
- Hardware: CPU basic (free)

#### Deploy

```bash
cd ai
git init
git remote add space https://huggingface.co/spaces/YOUR_USERNAME/nexvote-ai
cp Dockerfile.hf Dockerfile
git add Dockerfile README.md main.py requirements.txt
git commit -m "Deploy NexVote AI service"
git push space main
```

#### Update Backend .env

```env
AI_SERVICE_URL=https://YOUR_USERNAME-nexvote-ai.hf.space
```

### Option 3: Fly.io

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
cd ai
flyctl launch --name nexvote-ai
flyctl deploy
```

Update .env:
```env
AI_SERVICE_URL=https://nexvote-ai.fly.dev
```

---

## Blockchain Configuration

### 1. Get Sepolia ETH

1. Install MetaMask
2. Switch to Sepolia testnet
3. Get free ETH from faucet: https://sepoliafaucet.com

### 2. Create Relayer Wallet

```bash
cd contracts
npx hardhat console --network sepolia
```

In console:
```javascript
const wallet = ethers.Wallet.createRandom()
console.log('Address:', wallet.address)
console.log('Private Key:', wallet.privateKey)
```

Send 0.1 Sepolia ETH to this address.

### 3. Deploy Contract (Already Deployed)

Existing deployment:
```
NexVoteRegistry: 0xf9839b6CaFa3130531b0a6fF632B4e85023a41DF
```

To redeploy:
```bash
cd contracts
npx hardhat run scripts/deploy.ts --network sepolia
```

Update .env with new address.

### 4. Authorize Relayer

```bash
npx hardhat run scripts/authorize-relayer.ts --network sepolia
```

---

## Docker Deployment

### 1. Install Docker

macOS:
```bash
brew install --cask docker
```

Ubuntu:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### 2. Build Images

```bash
./scripts/build.sh --docker
```

### 3. Start All Services

```bash
docker compose up -d
```

Services will be available at:
- Frontend: http://localhost:4200
- Backend: http://localhost:3000
- AI Service: http://localhost:8000
- PostgreSQL: localhost:5432

### 4. View Logs

```bash
docker compose logs -f
```

### 5. Stop Services

```bash
docker compose down
```

---

## Production Deployment

### Frontend (Vercel/Netlify)

Build:
```bash
cd frontend
npm run build
```

Output: `dist/nexvote-frontend/browser/`

Deploy to Vercel:
```bash
npm install -g vercel
vercel --prod
```

### Backend (Railway/Fly.io)

Railway:
```bash
npm install -g railway
railway login
railway init
railway up
```

Fly.io:
```bash
cd backend
flyctl launch
flyctl deploy
```

### Database (Neon/Supabase)

Neon (free tier):
1. Visit https://neon.tech
2. Create new project
3. Copy connection string
4. Update DATABASE_URL in production .env

### AI Service

See [ai/DEPLOYMENT.md](ai/DEPLOYMENT.md) for detailed instructions.

---

## Troubleshooting

### AI Service: sentencepiece Error

```bash
pip3 install sentencepiece sacremoses --user
```

Or use virtual environment:
```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Database Connection Failed

Check PostgreSQL is running:
```bash
# macOS
brew services list | grep postgresql

# Ubuntu
sudo systemctl status postgresql
```

Verify credentials:
```bash
psql -U nexvote -d nexvote_dev -h localhost
```

### Frontend: Module Not Found

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Backend: TypeScript Errors

```bash
cd backend
npm run build
```

### Port Already in Use

Find and kill process:
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9
lsof -ti:4200 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

### Docker: Permission Denied

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Email Not Sending

Check Brevo dashboard for:
- SMTP key is active
- Sending domain is verified
- Daily limit not exceeded

Test SMTP connection:
```bash
telnet smtp-relay.brevo.com 587
```

---

## Verification Checklist

After setup, verify:

- [ ] PostgreSQL database created and migrated
- [ ] Backend starts without errors on port 3000
- [ ] Frontend loads at http://localhost:4200
- [ ] AI service responds at http://localhost:8000/health
- [ ] Can register new user
- [ ] Receive verification email
- [ ] Can create community
- [ ] Can create proposal
- [ ] Translation works (change language)

---

## Quick Start Commands

Start all services:
```bash
# Terminal 1 - AI
cd ai && ./run-fixed.sh

# Terminal 2 - Backend
cd backend && npm run dev

# Terminal 3 - Frontend
cd frontend && npx ng serve
```

Or use helper script:
```bash
./scripts/start.sh
```

Or use Docker:
```bash
docker compose up
```

---
