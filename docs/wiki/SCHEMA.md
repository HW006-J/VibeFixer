# Wiki Schema

This file is the configuration for this wiki. It documents the conventions, page types, tag taxonomy, and any workflow customizations. The LLM reads this first when entering the wiki, and its conventions override the defaults documented in the `llm-wiki` skill.

This file is **co-evolved with the user**. When the LLM notices a recurring pattern in your edits or feedback that isn't here, it will propose adding it. When something here stops fitting, prune it.

## Wiki location

- Wiki root: `docs/wiki/`
- Raw sources: `docs/raw/`
- Asset/image storage: `docs/raw/assets/`

## Page types

This wiki uses these page types, each with a dedicated subdirectory:

- `source` (in `docs/wiki/sources/`) — one summary page per ingested source.
- `entity` (in `docs/wiki/entities/`) — pages about specific things: people, papers, products, places, organizations.
- `concept` (in `docs/wiki/concepts/`) — pages about ideas, methods, frameworks, abstractions.
- `synthesis` (in `docs/wiki/synthesis/`) — cross-cutting analyses, comparisons, query answers filed back.
- `decision` (in `docs/wiki/decisions/`) — one page per non-obvious engineering or security decision: what was chosen, what was rejected, and why. Maps to the `decision` node type in `docs/wiki/graph/ontology.yaml`.

Add additional types here as the wiki evolves.

`decision` pages carry these frontmatter fields in addition to the common ones:
- `status` — `proposed` | `accepted` | `superseded`
- `supersedes` — slug of the decision this replaces, if any

## Tag taxonomy

Keep this list small and disciplined — a wiki with 200 tags has effectively no tags.

- `rls` — Row Level Security policies, the unsafe-policy detection, and policy semantics.
- `scanner` — reading and parsing migrations from the whitelisted GitHub repository.
- `repair-flow` — explanation, proposal, human approval, and application of the trusted policy change.
- `demo` — anything scoped to the 2–3 minute live demonstration: pacing, scripted narrative, demo assets.
- `security` — trust boundaries, secret handling, and the constraints in `CLAUDE.md` (no service-role key, no arbitrary model-generated SQL).
- `open-question` — pages or sections that flag unresolved questions.

## Page sizing

- Soft cap: 400 lines / ~2,000 words. Consider splitting beyond this.
- Hard cap: 800 lines. Must split.

## Frontmatter requirements

Every page must have:
- `type`
- `title`
- `tags`
- `created`
- `updated`

Plus type-specific:
- `source` pages: `authors`, `url` (if applicable), `raw`, `ingested`
- Non-source pages: `sources` listing the source-summary pages drawn from

## Optional graph metadata

Pages may declare typed graph metadata under a top-level `graph:` key. This is the source of truth for the compiled knowledge graph under `docs/wiki/graph/`. Markdown remains canonical; the graph is a regenerable index. Pages without `graph:` still appear as nodes (derived from `type`/`kind`) and still contribute `mentions` edges from body `[[wikilinks]]`.

```yaml
graph:
  node_id: person:praney-behl       # optional; default <node_type>:<slug>
  node_type: person                  # optional; default mapped from type/kind via ontology
  canonical: true                    # mark as canonical when multiple slugs alias the same entity
  aliases: [Praney, praney@example.com]
  relationships:
    - predicate: founded
      object: company:seedblocks
      source: praney-founder-context-dump   # source-page slug
      evidence: "Solo technical founder and sole director..."
      confidence: high               # high | medium | low
      status: current                # current | historical | proposed | disputed | superseded
      # optional:
      # valid_from: 2025-01-15
      # valid_to: 2026-03-01
      # notes: "..."
      # raw_ref: "docs/raw/founder-dump.md#L42"
      # contradicts: edge-id-or-source-slug
      # supersedes: edge-id-or-source-slug
```

Required fields on every relationship: `predicate`, `object`, `source`, `evidence`, `confidence`, `status`. Predicates and the subject/object types they accept are declared in `docs/wiki/graph/ontology.yaml`. Typed semantic edges must be supported by an explicit source — never emit one inferred from training data alone.

## Index structure

(Update this section when sharding.)

Currently flat: a single `docs/wiki/index.md` listing all pages.

When the wiki passes ~150 pages or `index.md` exceeds 300 lines, shard into `docs/wiki/indexes/<type>.md` and update this section.

## Graph layer

The wiki has an optional compiled graph layer under `docs/wiki/graph/`:

- `docs/wiki/graph/ontology.yaml` — declares node types and predicates. **Tracked.** Edit this when you introduce new predicates or domain types.
- `docs/wiki/graph/nodes.jsonl`, `docs/wiki/graph/edges.jsonl` — generated. Track in git only if you want graph diffs in PRs.
- `docs/wiki/graph/graph.sqlite` — generated. Gitignored by default.
- `docs/wiki/graph/graph.graphml` — generated. Track only if you want to diff it.

Generation is reproducible from markdown via `scripts/wiki_graph_extract.py`. The graph can be deleted at any time and rebuilt without losing knowledge — markdown is canonical.

## Workflow customizations

(Empty initially. Document any deviations from the default ingest/query/lint workflows here.)

## User preferences

(Empty initially. As the user expresses style preferences — "always include a 'Why this matters' section on concept pages", "never use bullet lists in summaries", "prefer comparative tables for synthesis pages" — capture them here so they persist across sessions.)

## Lint cadence

- Structural lint: after every 5 ingests.
- Semantic lint: weekly or after every 20 ingests.
- Gap-finding: monthly.
- Graph lint + extract: after every ingest that adds typed `graph.relationships`.

Adjust based on the wiki's growth rate.
