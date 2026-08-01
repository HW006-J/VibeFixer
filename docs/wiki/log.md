# Wiki Log

Append-only chronological record of operations on the wiki. Each entry begins with `## [YYYY-MM-DD] <op> | <description>` so it's parseable with `grep "^## \[" log.md | tail -N`.

Operations:
- `ingest` — a source was processed into the wiki.
- `query` — a question was answered against the wiki (typically only logged when the answer was filed back as synthesis).
- `lint` — a health check was run.
- `schema` — the schema was modified.
- `shard` — an index was sharded.

---

## [2026-08-01] schema | Wiki initialised at docs/wiki/; added `decision` page type and seeded the tag taxonomy (rls, scanner, repair-flow, demo, security, open-question). LLM Wiki stanza appended to CLAUDE.md and AGENTS.md.

## [2026-08-01] ingest | Backfilled the repository at commit `a6a02ae` as [[repository-state-2026-08-01]] — 8 pages created: 1 source, 1 entity, 4 concepts, 2 decisions, 1 synthesis ([[project-knowledge-recap]]).

## [2026-08-01] ingest | Recorded [[newsletter-leak-over-transport-vuln]] (proposed) — newsletter signup leak reframed from an HTTP/TLS transport bug to an `anon`-readable RLS finding; implementation prompt written to `prompts/PROMPT_3_newsletter_leak.md`.

## [2026-08-01] ingest | Recorded [[multi-file-audit-engine]] (proposed) — widen the engine to firebase.rules, source credentials, package.json and .env.example; prompt written to `prompts/PROMPT_4_multi_file_engine.md`. Revised 3-minute demo script to 6 beats.
