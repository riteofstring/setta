# Setta 4 Sprites Parallel Branch

Status: Active experiment

## Purpose

`setta-4-sprites-development` is a long-lived experimental branch based on
Setta 4. It carries the Sprites-hosted runtime work so the team can evaluate
cloud execution with the Setta 4 UI and Director without committing the main
Setta 4 line to this cloud architecture.

Do not merge this branch into Setta 4 until the team explicitly decides to
adopt the Sprites direction.

## Initial Integration

- Setta 4 baseline: `c8d73b307a1a7854a8a5701f2996d9458d6d12a8`
- Sprites source branch: `setta-3-sprites-development`
- Sprites source revision: `1ec5b82f5fbb4c433311466065bf325597c836eb`
- Development branch: `setta-4-sprites-development`

The initial integration imports the Sprites provider/runtime platform and
adapts it to the current Setta 4 contracts, runtime server, desktop registry,
speech path, and Director clients. Setta 4 owns the resulting product
behavior; the Setta 3 Sprites branch is historical source material rather than
a second implementation to keep synchronized.

## Ongoing Branch Workflow

1. Continue normal product development on Setta 4.
2. Periodically merge the current Setta 4 branch into
   `setta-4-sprites-development`.
3. Resolve conflicts in favor of Setta 4 product contracts and UI behavior,
   then adapt the Sprites integration to those current contracts.
4. Keep Sprites/provider details behind the runtime and hosted-access
   boundaries. Director, speech, and other renderer features should continue
   to address whichever runtime is active through the desktop registry.
5. Regenerate Go-owned TypeScript contracts whenever their owner-defined
   inputs change.

The branch should not add compatibility layers for either older Setta 4
contracts or the original Setta 3 integration. Replace superseded
implementations directly.

## Evaluation Scope

The experiment should establish:

- whether provisioning, secure pairing, credential refresh, and cleanup are
  reliable enough to feel automatic;
- whether the Setta 4 Director and conversation flows behave correctly when a
  hosted runtime is active;
- whether accounting, spending cutoff, disk admission, and workload leases
  safely bound hosted work;
- whether reconnect, application restart, and runtime destruction preserve a
  coherent user experience; and
- whether the operational cost and complexity justify this cloud direction.

When verification is requested, exercise the production
Electron/main/preload/renderer/HTTP/store paths with temporary app data,
including runtime switching and the relevant Director conversation workflow.
