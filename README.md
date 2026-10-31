# AI Research OS

All 16 screens from the mockup, plus a landing page: Dashboard, Paper Library, Graph Canvas, Paper View, Semantic Search, Literature Survey, Gap Detection, Hypothesis Generator, Contradiction Detection, Timeline, AI Copilot, Export & Collaborate, Agent Workflows, Concept Clusters, Recommendation Feed, Settings. Additions: Knowledge Notebook (17), Writing Studio (18), Reproduce Lab (19) and Reading Queue (20).

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
- **Reproduce Lab**: recreate a paper or turn an idea into an experiment. Pulls datasets, models, hyperparameters, reported metrics, compute and code links from the PDF, and flags what the paper leaves out. You get a step-by-step plan in “Guide me” mode (one step at a time, hints, check-yourself questions) or “Plan it for me” mode (full checklist). There is also a results scorecard (yours vs the paper's, with a reproduced/below verdict), a mentor that knows your progress and the paper text, and `.md` and `.py` exports. **Build it for me** goes further: with a Claude key the platform designs the codebase, writes every file (each aware of the earlier ones), reviews and fixes its own code twice, and checks it in the browser with Pyodide (every file parses, every local import resolves). It then packages everything as a Colab notebook (free T4 GPU, smoke test first) or a `.zip`. Paste the run output back: the `RESULTS_JSON` line fills the scorecard, and a traceback goes to the AI to fix the file it came from. Without a key you get a structured template. Entry points are “Reproduce this” on any paper and “Plan experiment” on saved hypotheses.
- **Ask my PDFs** (in the Copilot): searches every page of every uploaded PDF (BM25 over page-sized passages) and answers only from those passages. Each answer cites `[n] Paper · p.X`; clicking a citation opens the reader on that page. Without a key it shows the best-matching passages. PDFs uploaded before this existed are re-read once to get their page text.
- **Share links**: drafts, Lab projects, collections and saved hypotheses each have a “Share link” button. It creates a read-only page whose content is compressed into the link itself (`#/s/…`), so nothing is uploaded and the link keeps working on any host. Viewers can “Save a copy to my workspace”. Shared content is treated as untrusted: fields are coerced and only https GitHub/arXiv links are rendered.
- **Topic alerts** (Feed → Alerts, plus a Dashboard card): follow topics or authors. Once a day the app asks arXiv for their newest papers (last 30 days), drops ones already in the library or shown before, and ranks the rest by similarity to your library. Add or dismiss each one.
- **Reading Queue (20)**: To-read and in-progress papers ranked by fit with a stated goal (in-progress and pinned first), suggestions from the library, and progress: pages per day (counted from the PDF reader), weekly pages and finished papers, streak, and an estimate of reading days left.
- **Open in Overleaf**: Writing Studio drafts become `main.tex` + `references.bib` (natbib). `[n]` and `(Author et al., Year)` citations are turned back into `\cite{}`. Sent through Overleaf's open-in-Overleaf POST, or downloadable as a LaTeX `.zip`.
- **Claude key setup**: a guided pop-up (what you get, where to get a key, test & save) opened from any “LOCAL ENGINE” badge, Settings, or a dismissible banner on the Copilot, Writing, Hypotheses and Lab build screens.
- **Sidebar**: expands to show every screen's number and name under group headings, or collapses to icons. The choice is remembered.
- **Writing Studio**: pick highlights → a cited Related Work / Background / Intro section (LaTeX `\cite{}`, author-year or numeric) plus `references.bib`.
- **Citation graph**: real references and citing papers from Semantic Scholar on each paper's Citations tab; import them or map them on the canvas. An optional S2 API key (Settings → Integrations) avoids the shared rate limit.
- **Sync & team**: sign in under Settings → Account & Sync. Workspaces sync automatically with a per-item three-way merge, so edits from several devices or teammates all survive; changes arrive live over SSE. Owners create single-use invite links (7 days) for Editor / Commenter / Viewer; the live stream authenticates with 30-second one-time tickets, never the session token. Server data lives in `server/data/` (set `DATA_DIR` / `PORT` to change).
- **Product tour**: a 26-step spotlight tour of every screen starts the first time someone enters the app; skip it with Esc or "Skip tour" and restart (or jump to a chapter) from Settings → Preferences or the ? button in the rail.
- **PWA**: installable and works offline in production builds; the phone layout puts the navigation in a bottom bar.
- **Local engine** (no key needed): TF-IDF semantic search, k-means clusters, gap detection, recommendations, extractive summaries, local explanations.
- **Claude** (optional): add an Anthropic API key in Settings → Integrations for LLM answers across Copilot, surveys, summaries, hypotheses, explain/define and the Writing Studio.
- arXiv and Semantic Scholar go through a proxy (`/arxiv`, `/s2`) provided by both the Vite dev server and `npm run server`.


## Deploy on Render (free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/musterya-sm/ai-research-os)

`render.yaml` builds the app and runs `server/index.js` on Render's free plan. Two limits of the free plan: the service sleeps after 15 minutes without visitors (the next visit takes about a minute to wake it), and its disk is wiped on every restart, so team-sync workspaces and synced PDFs on the server don't last. Everyone's own library stays in their browser and is unaffected, and share links don't use the server at all.
