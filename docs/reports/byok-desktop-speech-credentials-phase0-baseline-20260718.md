# BYOK Desktop Speech Credentials Phase 0 Baseline

Date: 2026-07-18

Plan: `docs/plans/byok-desktop-speech-credentials-20260717.md`

## Scope

This baseline records the current pre-BYOK desktop speech behavior through the
existing runtime tests and Electron workflows. The current product still uses
`OPENAI_API_KEY` in the Electron-spawned backend environment for configured
desktop speech; this report is the reference point before the hard cutover to
Electron-vault-owned credentials.

## Commands

```sh
env -u OPENAI_API_KEY -u SETTA_E2E_OPENAI_SPEECH_BASE_URL ./scripts/go.sh test -v ./internal/runtime -run 'TestRuntimeServesTextOnlySpeechCapabilitiesAndTypedFailures|TestConfiguredRuntimeServesSpeechCapabilitiesAndTranscription'
node desktop/tests/electron/run-workflows.mjs --workflow global-speech-session --skip-build
node desktop/tests/electron/run-workflows.mjs --workflow topic-conversation-speech-arbitration --skip-build
node desktop/tests/electron/run-workflows.mjs --workflow runtime-picker --keep-artifacts
```

All commands passed.

## Artifacts

| Coverage | Artifact |
| --- | --- |
| Configured desktop speech and restart | `.recordings/global-speech-session/20260718T072557469Z` |
| Synthesis and playback arbitration | `.recordings/topic-conversation-speech-arbitration/20260718T072613634Z` |
| Local/remote runtime switching with no speech key | `test-results/electron-integration/runtime-picker/2026-07-18T072644-181Z/workflow` |

## Recorded Behavior

| Behavior | Current baseline |
| --- | --- |
| No key | Runtime test reports `providerStatus: "not_configured"` and rejects transcription-session creation with `not_configured`. The runtime-picker artifact records local and remote `speech:read-capabilities` IPC responses as `not_configured` while workspace switching succeeds. |
| Configured key | `global-speech-session` launches the desktop with the fake provider key in `OPENAI_API_KEY`; capabilities report `configured`. |
| Transcription | `global-speech-session` creates one `/speech/transcription/sessions` request and receives the fake provider scoped client secret through the production Electron/main/preload/HTTP path. |
| Synthesis | `topic-conversation-speech-arbitration` records four successful `/speech/synthesis` backend requests. The terminal phase added two audio creations, plays, and completions over the baseline. |
| Restart | `global-speech-session` performs two launches against the same temporary app data. The master voice remained `marin`, and the idempotent master input state was preserved. The current credential source is still reinjected by environment on both launches. |
| Remote runtime | `runtime-picker` pairs a separate `setta serve` runtime, switches to it, opens a remote workspace, handles device revocation, switches back to local, then observes the stopped remote as unreachable. No speech key was provided; both local and remote capability reads stayed `not_configured`. |

## Notes For Next Phases

- The configured-key desktop baseline is intentionally the old behavior:
  `OPENAI_API_KEY` is supplied to the Electron-spawned backend.
- The restart baseline proves app data and master voice state survive restart,
  but it does not prove credential restoration without reinjection. That is the
  behavior Phase 2 and Phase 4 must add and verify.
- The remote-runtime baseline proves switching and remote workspace operation
  while speech is unconfigured. Later BYOK work must preserve the runtime
  isolation and prove the local vault credential is not sent to the remote.
