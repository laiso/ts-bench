# `docs/` — generated static assets only

**Authoritative prose** for this project lives in **`specs/000-project-handbook/`** (and Spec Kit artifacts under `.specify/` / `specs/<feature>/`). Do not add long-form Markdown here.

This directory exists for **GitHub Pages** output:

- **`swelancer-tasks/`** — built by `bun run build:swelancer-pages` (see root `README.md`). `tasks.json` may be gitignored when generated locally; CI can regenerate.
- **`index.html`** — benchmark results dashboard (tier ratings, historical runs, task breakdown).
- **`results/`** — per-agent result pages with OGP metadata, built by `bun run build:results-pages`. Generated files are gitignored; CI rebuilds on deploy.
