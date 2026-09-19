# Setta Review

Setta Review opens producer-neutral review projects, presents claims, choices, and exact evidence
in Setta Workspace, and exports portable responses. It does not run or control agents.

Codex, Claude Code, OpenCode, a script, or a person can write the same versioned JSON request. The
producer remains responsible for deciding what to do with the returned response.

## Playground

The checked-in playground contains three realistic requests in one project:

- a completion review with consensus, disagreement, an unproven claim, a claim with no external
  assessments, a real Git hunk, structured results, and a run log;
- a rollout choice whose factor columns link to exact Git and JSON evidence; and
- a three-poster comparison with floating Workspace windows and artifact-anchored drawing.

Run it from the repository root:

```console
pnpm review:playground
```

The launcher builds Review, seeds `tmp/review-playground/review-project` from the immutable fixture,
creates its small Git worktree, imports external assessments through the public mutation contract,
and opens the app. Later launches preserve decisions and drawings in that ignored working copy.
Remove that working directory to reset the example.

## Commands

An installed Setta release exposes the same app without any agent-specific SDK:

```console
setta review open --project-root ./my-review
setta review schema --pretty
setta review snapshot --project-root ./my-review --pretty
setta review apply --project-root ./my-review --file mutation.json --pretty
setta review export --project-root ./my-review --continuations --pretty
```

`open` owns one foreground, loopback-only session. `snapshot` and `apply` use that live session when
one exists and otherwise operate locally. Every mutation names the observed revision; Review never
silently rebases a stale decision or retries an indeterminate write.

## Project format

A review project is ordinary, portable files:

```text
my-review/
  review.json
  requests/
    implementation.json
    rollout.json
  evidence/
    run.log
    results.json
  artifacts/
    candidate-a.png
  repository/
    .git/
    ...
```

`review.json` lists immutable request documents. A completion request contains claims. A choice
request contains options and either a tradeoff matrix or artifact candidates. Both can relate a
claim, factor, or option to an exact Git hunk, UTF-8 line range, JSON pointer, or content-addressed
local artifact with one of four meanings: `supports`, `challenges`, `qualifies`, or `informs`.
Diff, text, and JSON references include the submitted content digest, so a later file change cannot
silently alter what an existing request means.

The backend validates every request before admission and resolves each evidence item independently.
A missing or changed item becomes visible failed evidence rather than making unrelated material
disappear. Request bytes and evidence digests anchor exported responses to what the human actually
reviewed.

External reviewers remain optional. Any harness can submit a recorded assessment through `apply`:

```json
{
  "projectId": "my-review",
  "expectedRevision": 3,
  "operations": [
    {
      "op": "importAssessment",
      "assessment": {
        "version": 1,
        "id": "claude-review-1",
        "requestId": "implementation",
        "claimId": "tests-pass",
        "assessment": "supported",
        "rationale": "The submitted focused suite exercises the changed behavior.",
        "caveat": null,
        "producer": {
          "model": "Claude Sonnet 4.5",
          "harness": "Claude Code"
        },
        "createdAt": "2026-09-19T18:30:00Z"
      }
    }
  ]
}
```

No assessment is different from an assessment that says evidence is insufficient. Review records
only submitted activity and never guesses whether another agent has started.

## Workspace behavior

The request title is the title of its decision section; there is no low-information request card.
Completion sections keep every claim visible and expand one claim’s model-and-harness assessments
and human controls in place. Choice matrices keep options, factors, tradeoffs, and response actions
in one adaptive section. Artifact choices use the same contract while candidate sections can move
into Workspace floating windows.

Selecting a claim, factor, or option highlights its typed evidence edges, cited lines or JSON
pointers, and asks Workspace to frame the participating sections. Git evidence is rendered as a
real diff. Text, JSON, logs, and artifacts remain rich sections rather than file receipts. The
inspector stays closed because the decisions and revision form belong beside the material.

Drawing never modifies an artifact. Review stores normalized paths against its exact SHA-256 and
includes them in a response or continuation packet. A revision request requires either written or
drawn feedback.

## Durable output

Human decisions live in ignored `.local/review/state.json`, separate from immutable producer input.
`export` writes one `review-response.json` per responded request and, with `--continuations`, one
packet that combines the exact request, resolved evidence, and response for the next arbitrary tool.

Review does not execute tests, edit source, invoke an agent, resume a paused run, contact providers,
commit, or push. It is a visual decision and handoff boundary, not an agent harness.
