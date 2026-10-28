# AI Research OS

All 16 screens from the mockup, plus a landing page: Dashboard, Paper Library, Graph Canvas, Paper View, Semantic Search, Literature Survey, Gap Detection, Hypothesis Generator, Contradiction Detection, Timeline, AI Copilot, Export & Collaborate, Agent Workflows, Concept Clusters, Recommendation Feed, Settings. Additions: Knowledge Notebook (17) and Writing Studio (18).

```bash
nvm use 20 && npm install
npm run dev      # app on http://localhost:5180 (local-only works without the server)
npm run server   # sync server on :5190 — accounts, shared workspaces, PDF storage, live updates
npm start        # production: build, then serve app + API + proxies from one process on :5190
```

- **Data**: seeded with 50 real arXiv papers; persisted in localStorage, PDFs in IndexedDB. Import PDFs, arXiv (search or ID), Zotero (Web API or CSL JSON / RIS / BibTeX export), BibTeX, or manually.
- **Reader**: continuous-scroll PDF viewer that resumes where you left off; highlights (Important / Idea / Question / Dictionary) that can span pages; **Explain** and **Auto-define** for any selection; read-aloud (browser text-to-speech).
- **Reading list**: To read / Reading / Done with per-paper progress; "Continue reading" on the dashboard.
- **Knowledge Notebook**: highlights, notes with `[[term]]` links and backlinks, related notes across papers, a personal dictionary that underlines terms everywhere, and Leitner flashcards with a daily streak and reminder.
- **Writing Studio**: pick highlights → a cited Related Work / Background / Intro section (LaTeX `\cite{}`, author-year or numeric) plus `references.bib`.
- **Citation graph**: real references and citing papers from Semantic Scholar on each paper's Citations tab; import them or map them on the canvas. An optional S2 API key (Settings → Integrations) avoids the shared rate limit.
- **Sync & team**: sign in under Settings → Account & Sync. Workspaces sync automatically with a per-item three-way merge, so edits from several devices or teammates all survive; changes arrive live over SSE. Owners invite by email as Editor / Commenter / Viewer. Server data lives in `server/data/` (set `DATA_DIR` / `PORT` to change).
- **PWA**: installable and works offline in production builds; the phone layout puts the navigation in a bottom bar.
- **Local engine** (no key needed): TF-IDF semantic search, k-means clusters, gap detection, recommendations, extractive summaries, local explanations.
- **Claude** (optional): add an Anthropic API key in Settings → Integrations for LLM answers across Copilot, surveys, summaries, hypotheses, explain/define and the Writing Studio.
- arXiv and Semantic Scholar go through a proxy (`/arxiv`, `/s2`) provided by both the Vite dev server and `npm run server`.
