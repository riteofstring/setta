# Instant Voice Capture Phase 0 Baseline

Date: 2026-07-17

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-baseline --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase0-baseline/20260717T193957279Z
```

## Baseline Timing

The deterministic Electron harness now records browser-side capture/WebRTC milestones and provider-side transcription-session request/response milestones. The current production path still presents **Listening** only after the Realtime transport reaches readiness.

| Provider setup delay | Click to mic grant | Click to WebRTC ready | Click to Listening | Session request to response | Finish to commit |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 ms | 0.7 ms | 7.8 ms | 108.6 ms | 1 ms | 0.4 ms |
| 500 ms | 0.7 ms | 510.2 ms | 517.2 ms | 502 ms | 1.1 ms |
| 1,500 ms | 0.7 ms | 1,514.0 ms | 1,542.7 ms | 1,502 ms | 1.1 ms |

## Findings

- Local microphone grant in the deterministic fixture is effectively immediate for all three runs.
- The visible **Listening** state moves with provider setup delay, confirming that the current controller boundary is still network readiness rather than local capture readiness.
- `firstRetainedFrameReleasedMs` and `localDrainCompletedMs` are intentionally `null` in this baseline because the buffered microphone lease does not exist yet.

## Pending Phase 0 Work

The disposable AudioWorklet-gated `MediaStreamAudioDestinationNode` feasibility harness and the live OpenAI smoke test remain pending. Those results should be appended here rather than replacing this baseline.
