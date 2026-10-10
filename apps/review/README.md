# Setta Review

Setta Review opens producer-neutral review projects, presents claims, choices, and exact evidence
in Setta Workspace, and records portable responses. It does not run or control agents.

Codex, Claude Code, OpenCode, a script, or a person can write the same versioned JSON request. The
producer remains responsible for deciding what to do with the returned response.

## Playground

The checked-in playground contains three realistic requests in one project:

- a completion review with consensus, disagreement, an unproven claim, a claim with no external
  assessments, a real Git hunk, structured results, and a run log;
- a rollout choice whose factor columns link to exact Git, source-code, and JSON evidence; and
- a three-poster comparison with floating Workspace windows and artifact-anchored drawing.

Complete the [source setup](../../CONTRIBUTING.md#source-setup), then run it from the repository root:

```console
pnpm review:playground
```

Start with the poster comparison, then investigate the checkout claims and rollout tradeoffs. The **Start here** buttons jump directly to each review, including completed ones in **Old**. These are fictional examples; responses are saved locally and never sent to a real team.

Add `--no-open` to print the URL without opening a browser, or `--fresh` to start another example
without deleting your previous work. The launcher prints a `--workspace` command to resume that
exact copy. The command returns when the app is ready; you can close the terminal. Running it
again reopens the same live playground. Stop it with `pnpm review:playground --stop`,
or add `--workspace PATH --stop` for another copy. Reopen the guide with **Start here** in the
left sidebar.

The launcher builds Review, seeds `tmp/review-playground/review-project` from the immutable fixture,
creates its small Git worktree, imports external assessments through the public mutation contract,
and opens the app. Later launches preserve decisions and drawings in that ignored working copy.
Use `--fresh` to start again while keeping this copy.

Unsent feedback, claim notes, and drawing annotations survive a refresh in the same browser tab.
They remain drafts until you submit them. Drafts are tied to the exact request and artifact
identities, so revised evidence cannot inherit an old drawing. If browser storage is unavailable,
Review keeps editing available, explains that the draft is held in memory, and warns before closing
the tab. Keep that tab open until you submit. An initial load failure offers **Try again**.

## Commands

The local build exposes these commands without an agent-specific SDK. Use its `setta` executable
or substitute the repository-local runner described in the contributor guide:

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

Project, CLI, HTTP, state, and JSON-evidence inputs share one strict lexical contract: valid UTF-8,
one JSON value, unique object keys, at most 32 nested containers, and at most 8 MiB per decoded
string, field name, or number, within each boundary's smaller byte limit. Closed contract documents
also reject unknown fields before Review applies semantic validation.

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
  source/
    worker.py
  artifacts/
    candidate-a.png
  repository/
    .git/
    ...
```

`review.json` lists immutable request documents. A completion request contains claims. A choice
request contains options and either a tradeoff matrix or artifact candidates. Both can relate a
claim, factor, or option to an exact Git hunk, complete source file, UTF-8 line range, JSON pointer,
or content-addressed local artifact with one of four meanings: `supports`, `challenges`,
`qualifies`, or `informs`. Source-code evidence declares a CodeMirror language: `python`, `bash`,
`javascript`, `typescript`, `json`, `yaml`, `toml`, `markdown`, or `plaintext`. Diff, code, text,
and JSON references include the submitted content digest, so a later file change cannot silently
alter what an existing request means.

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

Native Workspace tabs divide the canvas into Current and Old views. Current contains unanswered
requests and completion drafts. A final response moves the entire request-and-evidence group to Old,
where it remains inspectable. Each view retains its own section layout and camera position.

Selecting a claim, factor, or option highlights its typed evidence edges, cited lines or JSON
pointers, and asks Workspace to frame the participating sections. Git evidence is rendered as a
real diff. Source files and JSON use read-only CodeMirror sections; bounded logs keep exact source
line numbers; artifacts retain their native previews. The inspector stays closed because the
decisions and revision form belong beside the material.

Drawing never modifies an artifact. Review stores normalized paths against its exact SHA-256 and
includes them in a response or continuation packet. A revision request requires either written or
drawn feedback.

## Durable output

Human decisions live in ignored `.local/review/state.json`, separate from immutable producer input.
Agents can read them through `snapshot` or the HTTP contract. Review has no browser export action.
The optional `export` command writes one `review-response.json` per responded request and, with
`--continuations`, one packet that combines the exact request, resolved evidence, and response for
an external tool that requires files.

Review does not execute tests, edit source, invoke an agent, resume a paused run, contact providers,
commit, or push. It is a visual decision and handoff boundary, not an agent harness.
