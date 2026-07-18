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
.recordings/instant-voice-capture-phase0-audioworklet/20260717T201242214Z
```

The disposable browser harness uses an `AudioWorkletNode` gate between a synthetic raw audio stream and a `MediaStreamAudioDestinationNode`, then adds the processed track to a loopback `RTCPeerConnection`. A positive prefix marker is produced and retained before delayed WebRTC readiness, the gate releases only after readiness, and a negative tail marker is observed on the processed track after the raw source track is stopped.

| Check | Result |
| --- | --- |
| Audio context sample rate | 44,100 Hz |
| Processed destination stream | 1 live audio track |
| RTCPeerConnection acceptance | Offer and answer negotiated audio; remote track was live audio |
| Prefix retained before WebRTC ready | Yes |
| Gate release after WebRTC ready | Yes |
| Prefix release to processed-track observation | 164.2 ms |
| Raw track stop state | `ended` immediately after stop |
| Raw stop to processed tail observation | 470.4 ms |
| Raw stop to gate drain | 639.1 ms |
| Explicit post-roll | 3,528 frames |

## Pending Phase 0 Work

The live OpenAI processed-track smoke test remains pending and should be appended here when credentials are deliberately available. The disposable local browser feasibility gate has passed.

Credential check on 2026-07-17T23:18:51Z: `OPENAI_API_KEY` was absent from the task environment, so the live OpenAI processed-track smoke was not run. This is not provider-integration evidence and does not close Phase 0.4.

The live smoke workflow is now registered for the explicit live tier:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-live-openai --skip-build
```

No-credential verification on 2026-07-17 wrote a blocked artifact and exited nonzero before launching a provider-backed smoke:

```text
.recordings/instant-voice-capture-phase0-live-openai/20260717T231851793Z
```

That artifact records `status: "blocked"` with reason `OPENAI_API_KEY was absent from the task environment`. This keeps Phase 0.4 open until a deliberate live credential run appends a passed transcript result.

## Phase 4 After Results

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase4-workflow --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase4-workflow/20260717T223419793Z
```

The deterministic production-path workflow now drives the real Electron main/preload/renderer/HTTP/store path with temporary app data. The browser fixture observes the actual WebRTC-bound processed media stream and withholds the scripted transcript until it sees a non-silent processed audio marker, so a fixed transcript alone cannot pass the workflow.

| Scenario | Provider setup delay | Click to local recording | Click to WebRTC ready | Click to processed marker | Finish to commit | Session request to response |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shell warm-up | 0 ms | 180.5 ms | 181.2 ms | 219.0 ms | 97.6 ms | 2 ms |
| Shell steady | 0 ms | 32.7 ms | 32.8 ms | 72.6 ms | 88.7 ms | 0 ms |
| Shell delayed | 1,500 ms | 25.1 ms | 1,516.2 ms | 1,578.2 ms | 1,581.8 ms | 1,502 ms |
| Easy Button pane delayed | 1,500 ms | 29.6 ms | 1,517.3 ms | 1,558.5 ms | 1,581.5 ms | 1,502 ms |
| Master overlay delayed | 1,500 ms | 22.3 ms | 1,508.5 ms | 1,569.4 ms | 1,583.8 ms | 1,502 ms |
| Master shortcut delayed | 1,500 ms | 24.5 ms | 1,509.0 ms | 1,549.5 ms | 1,576.9 ms | 1,501 ms |

Steady shell click-to-local-recording changed by 7.6 ms between the 0 ms and 1,500 ms provider-delay cases, while WebRTC readiness and final commit moved with the injected provider delay. This confirms the local **Listening** boundary is no longer gated on transcription-session creation or WebRTC readiness after the initial cold worklet/module warm-up.

The workflow also verified:

- Easy Button pane speech stopped before provider readiness, retained the early processed marker, submitted one complete transcript to the frozen source pane, and did not route it to the master.
- Active-run pane speech stopped before provider readiness, retained the marker, and routed the completed transcript through the existing `queue_parent_turn` lifecycle.
- Shell, Global master overlay, and Global master shortcut captures all reached local recording and finished during connection.
- Cancellation, connection failure, duration failure, runtime switch, and source-pane closure each produced `commitDelta=0`, `stoppedTrackDelta=1`, and `peerCloseDelta=1`.
- Another-pane arbitration kept non-source panes from stealing the active capture.
