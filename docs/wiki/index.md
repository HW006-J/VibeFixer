# Wiki Index

The catalog of all pages in this wiki. Each entry: a wikilink to the page and a one-line summary. The LLM reads this first when answering queries to identify candidate pages.

Keep summaries tight — one line each. The index is engineered to be cheap to read; a fat index defeats its purpose.

When this file exceeds ~300 lines or the wiki passes ~150 pages, shard into `docs/wiki/indexes/<type>.md` and replace this file with a directory of shards. See the `scaling-playbook.md` reference in the `llm-wiki` skill for the migration procedure.

---

## Sources

- [[repository-state-2026-08-01]] — the repository at commit `a6a02ae`, read in full: 68 source files, all docs, 23 commits.

## Entities

- [[demo-target-repository]] — `HW006-J/rls-red-alert-demo-target`, the only repo whose live database may be tested; fetch allowlist and the deployed `USING (true)` vulnerability.

## Concepts

- [[rls-audit-engine]] — the deterministic four-stage pipeline and twelve-rule pack in `src/lib/audit/`; the only source of findings.
- [[live-leak-validation]] — proving the leak with a real authenticated query, and deriving demo state from two cross-checked live facts.
- [[trusted-repair-boundary]] — two fixed SQL constants, an allowlist check on AI proposals, and four guards around the executor.
- [[anti-hallucination-contract]] — the LLM may phrase, never assert; enforced through `performed: true` literal discriminants.

## Decisions

- [[deterministic-rules-own-findings]] — findings come only from the rule engine; accepted cost is under-reporting rather than fabrication.
- [[supabase-cli-for-mutations]] — apply/reset shell out to the local Supabase CLI; the demo therefore cannot run from Vercel.
- [[newsletter-leak-over-transport-vuln]] — *proposed.* Newsletter signup leak shipped as an `anon`-readable RLS finding rather than an HTTP/TLS transport bug; why the transport version was rejected.
- [[multi-file-audit-engine]] — *proposed.* Widen the engine to Firebase rules, source credentials, and dependencies; the allowlist denylist and the `.env.example` precision trap.

## Synthesis

- [[project-knowledge-recap]] — **start here.** Full recap of the project as of 2026-08-01: architecture, three safety boundaries, development history, gaps, and operational demo knowledge.
