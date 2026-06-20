# Semantic Cartographer Phase 7 Retrieval Report

Date: 2026-06-14

## Scope

Phase 7 adds an advisory retrieval layer over canonical semantic graph records.
It does not change semantic truth: nodes, evidence, activity, steering, context
packs, and cartographer patches still come from the semantic event log and its
projections.

## Before

The phase readiness review recorded no FTS tables, no retrieval service, no
retrieval-backed context compiler expansion, no retrieval-backed cartographer
window input, and no usefulness-loop evidence. Context packs could record what
they delivered, but recall was limited to explicit source associations,
neighborhood edges, active steering, workspace constraints, and recent activity.

## After

The implementation indexes bounded semantic records with SQLite FTS5:

- semantic node labels, summaries, kind/status text;
- evidence titles, summaries, quoted text, paths, URIs, hashes, and source refs;
- activity summaries and workflow/chat/run associations;
- context pack item titles, summaries, reasons, and source refs.

The retrieval service merges explicit source associations, graph neighbors,
prior context-pack workflow/run associations, active steering and pins, recent
activity, exact path/text matches, and FTS hits. Results include stable ids,
source refs, scores, and reason strings. Context packs persist the resulting
reasons in item history, and cartographer input bundles carry
`retrievalResults` as advisory context diagnostics.

## Deterministic Evidence

Focused tests now cover:

- FTS insert/update/tombstone/rebuild and exact path lookup:
  `TestStoreMaintainsSemanticSearchIndex`.
- Deterministic ranking with explicit source associations ahead of FTS:
  `TestSemanticRetrievalRanksExplicitSourcesBeforeFTS`.
- Stale index repair:
  `TestSemanticRetrievalRebuildsStaleSearchRows`.
- Promoted decision delivery to future context packs with retrieval reasons:
  `TestContextCompilerUsesRetrievalForRelevantPromotedDecision`.
- Steering delivered as an explicit context delta:
  `TestContextCompilerRecordsSteeringDeltaContext`.
- Cartographer windows receiving retrieval-backed nodes/evidence/results:
  `TestCartographerObserverIncludesRetrievalBackedCandidates`.

## Performance Check

Command:

```text
./scripts/go.sh test ./internal/semanticgraph -run '^$' -bench BenchmarkSemanticRetrievalLargeSyntheticEvidenceSet -benchtime=5x -count=1
```

Result on Apple M1 Pro:

```text
BenchmarkSemanticRetrievalLargeSyntheticEvidenceSet-8    5    9056158 ns/op
```

The benchmark seeds 500 semantic nodes with 500 evidence anchors, then retrieves
with both FTS query text and an exact path. This is sufficient for the first
Phase 7 production path because retrieval is bounded to existing context budgets
and cartographer input limits.
