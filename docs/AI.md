---
title: NexVote AI Service
emoji: 🗳️
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
license: mit
---

# NexVote AI Service

AI-powered translation, summarization, and semantic search service for the NexVote decentralized voting platform.

## Features

- Multi-language translation (6 languages: en, ta, hi, kn, ml, te)
- Proposal summarization (BART-large-cnn)
- Semantic search with embeddings (all-MiniLM-L6-v2)
- RESTful API with FastAPI

## API Endpoints

- POST /translate - Translate text between supported languages
- POST /summarize - Generate proposal summaries
- POST /embed - Create vector embeddings
- POST /search - Semantic search across content
- GET /health - Service health check

## Models Used

- Translation: Helsinki-NLP/opus-mt-{en-ta, ta-en, en-hi, hi-en, en-kn, kn-en, en-ml, ml-en, en-te, te-en}
- Summarization: facebook/bart-large-cnn
- Embeddings: sentence-transformers/all-MiniLM-L6-v2

## Environment Variables

- AI_API_KEY: API key for authentication (optional)
- AI_SERVICE_PORT: Port to run the service on (default: 8000)

## Local Development

```bash
pip install -r requirements.txt
python main.py
```

## Documentation

Visit /docs for interactive API documentation (Swagger UI)
