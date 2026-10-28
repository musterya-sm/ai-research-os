# AI Research OS

All 16 screens from the mockup, plus a landing page: Dashboard, Paper Library, Graph Canvas, Paper View, Semantic Search, Literature Survey, Gap Detection, Hypothesis Generator, Contradiction Detection, Timeline, AI Copilot, Export & Collaborate, Agent Workflows, Concept Clusters, Recommendation Feed, Settings.

```bash
nvm use 20 && npm install && npm run dev   # http://localhost:5180
```

- **Data**: seeded with 50 real arXiv papers (agents, memory, RAG); persisted in localStorage. Import from arXiv (search or ID), BibTeX, or manually.
- **Local engine** (no key needed): TF-IDF semantic search, k-means clusters, co-occurrence gap detection, content-based recommendations, extractive summaries.
- **Claude** (optional): add an Anthropic API key in Settings → Integrations to get LLM answers in Copilot, surveys, summaries, hypotheses, gap and contradiction analysis.
- arXiv requests go through the Vite proxy (`/arxiv`), so use `npm run dev` or `npm run preview`.
