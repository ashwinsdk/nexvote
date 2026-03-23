# NexVote Project Analysis

## 1. Project Overview

NexVote is a multi-service civic decision platform where users create communities, publish proposals, discuss them, vote, and finalize outcomes with an on-chain audit trail.

The repository is organized as a monorepo with five runtime domains:

- Frontend web app (Angular)
- Backend API (Express + TypeScript)
- AI service (FastAPI + Transformers)
- Smart contracts (Hardhat + Solidity)
- Database migrations/seeds (Knex + PostgreSQL)

At runtime, the backend is the central orchestrator:

- Authenticates users
- Enforces permissions
- Calls AI service for summarize/translate/embed
- Persists and reads from PostgreSQL
- Calls blockchain relayer logic to anchor hashes on Sepolia
- Exposes REST endpoints consumed by the Angular frontend

## 2. Primary Goals (As Implemented)

Based on actual code paths, the implemented goals are:

- Community-based governance with role control (owner/moderator/member)
- Proposal lifecycle management (draft, voting, finalized, archived)
- Vote tracking with yes/no/abstain counts
- Multilingual UX and content translation workflows
- AI-assisted summarization and semantic embedding support
- Tamper-evident audit via hash registration/finalization events on chain
- Operational notifications (in-app and optional email)

## 3. Tech Stack and Tooling

### Frontend

- Angular 17 standalone app
- RxJS + Angular Router + Forms
- Route guards and HTTP interceptors
- Lucide Angular icons
- SCSS styling pipeline

### Backend

- Node.js + Express + TypeScript
- Knex for SQL access and migrations
- PostgreSQL driver (pg)
- JWT auth (jsonwebtoken)
- Security middleware (helmet, cors, express-rate-limit)
- Logging via pino
- Email via nodemailer
- Ethers v6 for relayer/contract interactions

### AI Service

- Python + FastAPI + Uvicorn
- sentence-transformers for embeddings
- HuggingFace Transformers pipelines for summarize/translate
- Optional NLLB fallback for selected language pairs

### Blockchain

- Hardhat + TypeScript scripts/tests
- Solidity contract with OpenZeppelin Ownable
- Sepolia target network

### DB and Infra

- PostgreSQL (docker compose uses pgvector image)
- Knex migrations + seed data
- Docker Compose for multi-service local orchestration
- Shell scripts for start/build/test automation

## 4. Repository Structure

Top-level structure:

- ai: FastAPI service (translation/summarization/embedding)
- backend: Express API and business logic
- contracts: Solidity contract + deploy/test scripts
- db: Knex migrations and seed data
- docs: setup documentation
- frontend: Angular application
- scripts: helper scripts for startup/build/tests
- temp: working artifacts and generated report material

Key file map:

- Runtime orchestration: docker-compose.yml, scripts/start.sh, scripts/build.sh, scripts/test.sh
- Environment template: .env.example
- Root functional readme: README.md

## 5. Module-Level Breakdown

### 5.1 Frontend (Angular)

Core role:

- Presents user/admin interfaces
- Maintains auth state
- Sends JWT + locale headers
- Calls backend endpoints through a centralized API service

Important parts verified:

- Route map includes login/register/verify, community views, proposal creation/details, admin panel, users, notifications, and profile pages
- Auth service stores token in cookie and localStorage and supports auth bootstrap
- Interceptor injects Authorization and X-Locale headers
- i18n service includes dictionary-driven multilingual content model

### 5.2 Backend (Express + TypeScript)

Core role:

- Main source of truth for governance workflows
- Handles auth, membership, proposals, votes, comments, notifications, admin actions
- Integrates AI service and blockchain relayer

Key runtime flow:

- App boot configures security middleware, locale middleware, rate limiter, request IDs
- Route groups mounted at /api/auth, /api/communities, /api/proposals, /api/admin, /api/users, /api/notifications
- Health endpoint checks AI availability and relayer balance status

Service responsibilities (from actual service files):

- ai: summarize/embed/translate calls to AI microservice
- translation: language normalization and translation orchestration
- relayer: chain provider/wallet/contract operations
- votingLifecycle: periodic checks/finalization/archive transitions
- notifications: in-app + email reminder and preference-aware dispatch
- email: SMTP-backed email delivery wrapper

### 5.3 AI Service (FastAPI)

Implemented endpoints:

- GET /health
- POST /embed
- POST /embed/batch
- POST /summarize
- POST /translate

Behavior:

- API key check via X-API-Key header (if configured)
- Lazy model loading to reduce startup weight
- Input validation and bounded batch sizes
- Translation model routing by source/target pair, with NLLB fallback mapping

### 5.4 Smart Contract Layer

Contract: NexVoteRegistry

Capabilities:

- Register proposal hash + id + level
- Finalize vote result hash
- Record admin status update hash
- Manage authorized relayers
- Verify stored proposal/result hash values

Access model:

- Owner can manage relayer allowlist
- Owner and authorized relayers can register/finalize/admin-update entries

### 5.5 Database Layer (Knex)

Schema covers:

- users, verifications, communities, community_members, community_join_requests
- proposals, proposal_metadata, votes, comments
- notifications and user notification settings
- admin_actions, audit_log, donations

Migrations add:

- Private community support + join request workflow
- Translation columns for community/proposal/comment canonical and language-tagged variants
- Notification and archive metadata tables/columns

Seed file provides:

- Demo users (admin/user/moderator)
- Demo community, membership, proposal, votes, comments, audit entry

## 6. Architecture (Runtime)

```text
+---------------------+         HTTPS/JSON         +----------------------+
|   Angular Frontend  | <------------------------> |   Express Backend    |
|   (port 4200/80)    |                            |   (port 3000)        |
+---------------------+                            +----------+-----------+
                                                               |
                                      +------------------------+-------------------------+
                                      |                        |                         |
                                      v                        v                         v
                          +--------------------+      +---------------------+   +-------------------+
                          |   PostgreSQL DB    |      |   FastAPI AI svc    |   |  Ethereum Sepolia |
                          |   (port 5432)      |      |   (port 8000)       |   |  NexVoteRegistry  |
                          +--------------------+      +---------------------+   +-------------------+
                                                                                         ^
                                                                                         |
                                                                                 Ethers relayer wallet
```

## 7. Core Functional Workflows

### 7.1 User Onboarding

- User registers
- OTP/verification flow confirms account
- JWT-based session created
- Authenticated requests use bearer token

### 7.2 Community and Membership

- Community can be public or private
- Private communities use join request table and status transitions
- Role checks gate privileged actions (owner/moderator/admin)

### 7.3 Proposal Lifecycle

- Proposal created with core text and metadata
- Optional AI summarization/translation enrichment is persisted
- Voting records are inserted and aggregate counters maintained
- Deadline and status transitions are processed by lifecycle logic

### 7.4 Finalization and Audit Trail

- Final vote outcome hash is computed by backend flow
- Relayer submits hash-linked lifecycle events to NexVoteRegistry
- Audit logs retain linkage between platform records and on-chain hashes

### 7.5 Notifications

- Notification records created for targeted events
- User settings table controls channel/category preferences
- Reminder sweep can run periodically in long-running backend process

## 8. Data Flow Summary

### Write path (proposal/vote)

- Frontend request -> backend validation/authz -> DB write
- Optional AI call (summary/translation/embed)
- Optional blockchain anchor through relayer
- Notification fanout and audit logging

### Read path (user views)

- Frontend request -> backend query + permission filtering
- Locale-aware transformation/selection
- API response to frontend rendering layer

## 9. Important Functions and Components

Representative high-impact implementation points:

- Backend app composition and route mounting (startup and middleware chain)
- Backend config parser for env-driven behavior
- Proposal/community/admin route handlers enforcing ownership and role checks
- AI integration service methods for summarize/embed/translate calls
- Relayer service methods for proposal registration/finalization/admin update txs
- Voting lifecycle scheduler methods for periodic state maintenance
- Frontend API service methods mapping typed calls to backend endpoints
- Frontend auth service token lifecycle and session bootstrap methods
- Frontend auth interceptor adding Authorization and locale headers
- Contract methods: registerProposal, finalizeVote, adminUpdate, setRelayer

## 10. Setup, Build, and Run

## 10.1 Local manual setup

- Install dependencies in backend, frontend, contracts, db, and ai
- Copy .env.example to .env and fill values
- Run Knex migrations from db module
- Start services using scripts/start.sh or module-specific commands

## 10.2 Scripted helpers

- scripts/start.sh
  - --local: installs missing dependencies, runs migrations, starts AI/backend/frontend
  - --docker: starts full docker compose stack
- scripts/build.sh
  - --local: backend TS build, frontend production build, contract compile
  - --docker: builds service images
- scripts/test.sh
  - supports backend, contracts, frontend, or all test targets

## 10.3 Docker compose

- Services: postgres, db-migrate, ai, backend, frontend
- Backend depends on postgres and ai
- Frontend depends on backend
- Database persisted via named volume pgdata

## 11. Environment Variables (Consolidated)

Main variables used by code/configs:

### Backend/API

- PORT
- NODE_ENV
- CORS_ORIGIN
- DATABASE_URL
- DATABASE_POOL_MIN
- DATABASE_POOL_MAX
- JWT_SECRET
- JWT_EXPIRES_IN
- OTP_EXPIRY_SECONDS

### AI integration

- AI_SERVICE_URL
- AI_API_KEY
- SIMILARITY_THRESHOLD
- EMBEDDING_DIMENSION
- MAX_SUMMARY_TOKENS

### Blockchain/relayer

- SEPOLIA_RPC_URL
- RELAYER_PRIVATE_KEY
- NEXVOTE_REGISTRY_ADDRESS
- CHAIN_ID

### Security/rate limits

- CAPTCHA_SECRET
- RATE_LIMIT_WINDOW_MS
- RATE_LIMIT_MAX_REQUESTS
- PROPOSAL_RATE_LIMIT_MAX
- RELAYER_RATE_LIMIT_MAX

### Email

- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_KEY
- EMAIL_FROM
- EMAIL_FROM_NAME

### IPFS

- IPFS_PINATA_API_KEY
- IPFS_PINATA_SECRET
- IPFS_GATEWAY_URL

## 12. Verified Assumptions in Current Code

- Backend is the policy enforcement layer; frontend is not trusted for authorization decisions
- Chain writes are intended through relayer flow, not direct end-user wallet tx in backend paths
- AI service availability improves features but core CRUD/voting data remains DB-backed
- Locale header is expected on requests and defaults are applied when missing

## 13. Current Limitations and Risks

Observed directly from repository state:

- Documentation drift exists in places (for example endpoint/model/version mentions not fully aligned with active code)
- Frontend environment defaults appear counterintuitive (production flag and API URL split should be rechecked)
- .env.example includes duplicated email variable block and a likely typo in one relayer placeholder token
- AI service README lists a /search endpoint that is not present in current FastAPI implementation
- Large-model cold starts may impact AI response latency in constrained deployments
- Local scripts assume certain host tools are already installed (node, python3, postgres availability)

## 14. Maintenance and Extension Notes

Recommended extension-safe practices for this codebase:

- Keep route handlers thin and move business logic into services
- Preserve translation column strategy and language-tag metadata when adding new content entities
- Extend notification categories via settings table and service-level fanout rules together
- Add migration + rollback pair for every schema change and keep seed data minimal but representative
- For new contract methods, update both relayer service integration and Hardhat tests in the same change
- Add end-to-end tests for proposal lifecycle and admin finalization to reduce regressions

## 15. Operational Commands (Observed)

Common commands already wired in package scripts:

- Backend: npm run dev, npm run build, npm test
- Frontend: npm start, npm run build, npm test
- Contracts: npm run compile, npm test, npm run deploy:sepolia
- DB: npm run migrate, npm run seed
- Root helpers: ./scripts/start.sh, ./scripts/build.sh, ./scripts/test.sh

## 16. Final Summary

NexVote is an integrated governance platform with clear module boundaries:

- Angular frontend for user/admin interaction
- Express backend as core policy and workflow engine
- FastAPI AI microservice for language and summarization support
- Solidity registry contract for immutable lifecycle hash anchoring
- Knex/Postgres persistence for primary application state

The repository is functionally complete for an end-to-end prototype and contains practical deployment/test tooling, while also showing a few documentation/config consistency gaps that should be cleaned up for production hardening.
