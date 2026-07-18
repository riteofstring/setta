# Instant Voice Capture Phase 0 Baseline

Date: 2026-07-17

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-baseline --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase0-baseline/20260717T195252606Z
```

## Baseline Timing

The deterministic Electron harness now records browser-side capture/WebRTC milestones and provider-side transcription-session request/response milestones, and verifies that the scripted transcript reaches the production master voice input IPC path. The current production path still presents **Listening** only after the Realtime transport reaches readiness.

| Provider setup delay | Click to mic grant | Click to WebRTC ready | Click to Listening | Session request to response | Finish to commit |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 ms | 0.7 ms | 7.6 ms | 108.4 ms | 1 ms | 0.5 ms |
| 500 ms | 0.7 ms | 507.7 ms | 514.9 ms | 502 ms | 0.5 ms |
| 1,500 ms | 1.0 ms | 1,510.2 ms | 1,554.1 ms | 1,502 ms | 1.1 ms |

## Findings

- Local microphone grant in the deterministic fixture is effectively immediate for all three runs.
- The visible **Listening** state moves with provider setup delay, confirming that the current controller boundary is still network readiness rather than local capture readiness.
- `firstRetainedFrameReleasedMs` and `localDrainCompletedMs` are intentionally `null` in this baseline because the buffered microphone lease does not exist yet.

## AudioWorklet Feasibility

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-audioworklet
```

Artifact:

```text
.recordings/instant-voice-capture-phase0-audioworklet/20260717T200729110Z
```

The disposable browser harness uses an `AudioWorkletNode` gate between a synthetic raw audio stream and a `MediaStreamAudioDestinationNode`, then adds the processed track to a loopback `RTCPeerConnection`. A positive prefix marker is produced and retained before delayed WebRTC readiness, the gate releases only after readiness, and a negative tail marker is observed on the processed track after the raw source track is stopped.

| Check | Result |
| --- | --- |
| Audio context sample rate | 44,100 Hz |
| Processed destination stream | 1 live audio track |
| RTCPeerConnection acceptance | Offer and answer negotiated audio; remote track was live audio |
| Prefix retained before WebRTC ready | Yes |
| Prefix release to processed-track observation | 162.8 ms |
| Raw track stop state | `ended` immediately after stop |
| Raw stop to processed tail observation | 470.3 ms |
| Raw stop to gate drain | 653.6 ms |
| Explicit post-roll | 3,528 frames |

## Pending Phase 0 Work

The live OpenAI processed-track smoke test remains pending and should be appended here when credentials are deliberately available. The disposable local browser feasibility gate has passed.
