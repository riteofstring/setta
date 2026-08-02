# Easy Button Presentation Recovery Phase 1 - 2026-07-16

## Scope

This report closes Phase 1 of
`docs/plans/easy-button-presentation-recovery-20260715.md`: typed artifacts in
topic conversations, metadata-only snapshot/event projection, visible-card
`ReadArtifact` loading, and artifact-policy verification.

## Deterministic Workflow

Commands:

```bash
pnpm -C desktop build
node desktop/tests/electron/easy-button-presentation-recovery-phase0.test.mjs \
  --skip-build \
  --keep-artifacts
```

Result: passed.

Local artifact:
`.recordings/easy-button-presentation-recovery-phase0/20260716T132741654Z`

The deterministic run verified:

| Scenario | Snapshot record | ReadArtifact payload | Rendered |
| --- | --- | --- | --- |
| Supplied language counts | `table`, `bar_chart` metadata only | table rows and bar-chart items | yes |
| Qualitative notes | `markdown` metadata only | markdown payload | yes |
| Numeric comparison | `bar_chart` metadata only | bar-chart payload | yes |
| Generated file | `file` metadata only | file payload | yes |
| Conversational answer | no artifact | no artifact read | no artifact card |

The baseline request snapshot contained only artifact identity/kind/title/time
keys. The typed table and bar-chart payload branches appeared only in the
`/conversations/artifacts/read` responses and rendered after visible-card reads.

## Live Codex

Commands:

```bash
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 \
  ./scripts/go.sh test ./internal/runtime \
  -run '^TestBackendTopicConversationArtifactWithLiveCodex$' \
  -count=1

./scripts/test_topic_conversation_workflows.sh --skip-build --live-only
```

Result: passed with local Codex ChatGPT auth available. The live artifact test
submitted a small supplied language-count dataset through the production
runtime/topic-conversation path, required the topic agent to emit a table
artifact, and read the typed payload back through `ReadConversationArtifact`.

## Repository Gates

Commands:

```bash
./scripts/format.sh
./check_quality.sh --all
```

Result: passed. The full required Electron workflow suite passed, including the
topic-conversation projection workflow after the fake narrator fixture was
corrected to emit contract-valid trimmed focus text.
