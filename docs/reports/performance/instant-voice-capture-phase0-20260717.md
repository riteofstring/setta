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

## Live OpenAI Smoke

The live smoke workflow is registered for the explicit live tier:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-live-openai --skip-build
```

Historical no-credential verification on 2026-07-17 wrote a blocked artifact and exited nonzero before launching a provider-backed smoke:

```text
.recordings/instant-voice-capture-phase0-live-openai/20260717T232234303Z
```

That artifact records `status: "blocked"` with reason `OPENAI_API_KEY was absent from the task environment`. It is retained as defect evidence for the old entrypoint and is superseded by the passed registered workflow below.

Passed provider result on 2026-07-17 used the ignored repository root `.env` with `OPENAI_API_KEY` deliberately absent from the invoking shell:

```text
.recordings/instant-voice-capture-phase0-live-openai/20260717T234416139Z
```

| Check | Result |
| --- | --- |
| Workflow status | `passed` |
| Credential source | `root-env` |
| Synthesis model | `gpt-4o-mini-tts` |
| Synthesis voice | `alloy` |
| Synthesized audio | 165,644 bytes |
| Transcription model | `gpt-realtime-whisper` |
| WebRTC endpoint | `https://api.openai.com/v1/realtime/calls` |
| Processed destination stream | 1 live audio track |
| Raw track stop state | `ended` |
| Expected transcript | `This is a live smoke test for instant voice capture.` |
| Completed transcript | `This is a live smoke test for instant voice capture.` |

The passed artifact includes `input_prefix_retained`, `webrtc_ready`, `output_prefix_observed`, `raw_track_stopped`, `gate_drained`, `transcript_commit_sent`, and `transcript_completed`. The workflow also verified that retained artifacts excluded both the root OpenAI API key and the ephemeral transcription client secret.

### Finalized Artifact Privacy Addendum

Workflow:

```text
env -u OPENAI_API_KEY -u SETTA_E2E_OPENAI_SPEECH_BASE_URL node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-live-openai --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase0-live-openai/20260718T022445623Z
```

This run finalized Electron shutdown and artifact writers before scanning for the root OpenAI API key and the ephemeral transcription client secret. The finalized artifact tree remained available and clean.

| Check | Result |
| --- | --- |
| Workflow status | `passed` |
| Credential source | `root-env` |
| Synthesized audio | 189,644 bytes |
| Expected transcript | `This is a live smoke test for instant voice capture.` |
| Completed transcript | `This is a live smoke test for instant voice capture.` |
| Finalized privacy scan | `passed` |

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

## Phase 4 Final Coverage Addendum

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase4-workflow --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase4-workflow/20260718T000723421Z
```

The final deterministic workflow run adds production-path coverage for playback preemption and app-shell teardown while capture is in flight. It also keeps the delayed-provider processed-track marker gate from the earlier Phase 4 run.

| Scenario | Provider setup delay | Click to local recording | Click to WebRTC ready | Click to processed marker | Finish to commit | Session request to response |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shell warm-up | 0 ms | 177.3 ms | 179.2 ms | 238.3 ms | 94.2 ms | 1 ms |
| Shell steady | 0 ms | 30.1 ms | 30.2 ms | 91.8 ms | 90.7 ms | 0 ms |
| Shell delayed | 1,500 ms | 30.6 ms | 1,512.3 ms | 1,574.6 ms | 1,568.4 ms | 1,502 ms |
| Easy Button pane delayed | 1,500 ms | 27.6 ms | 1,513.3 ms | 1,575.1 ms | 1,573.7 ms | 1,502 ms |
| Master overlay delayed | 1,500 ms | 22.5 ms | 1,507.5 ms | 1,568.5 ms | 1,595.8 ms | 1,501 ms |
| Master shortcut delayed | 1,500 ms | 30.2 ms | 1,511.0 ms | 1,571.4 ms | 1,571.4 ms | 1,502 ms |
| Playback preemption pane delayed | 1,500 ms | 25.1 ms | 1,516.4 ms | 1,556.2 ms | 1,585.8 ms | 1,500 ms |

Steady shell click-to-local-recording changed by 0.5 ms between the 0 ms and 1,500 ms provider-delay cases.

Additional coverage verified:

- Playback preemption paused exactly one active narrator audio item (`audioPauseDelta=1`) before the delayed pane capture completed.
- App-shell teardown during an in-flight master capture produced `commitDelta=0`, `stoppedTrackDelta=1`, and `peerCloseDelta=1`.

## Phase 4 Production Teardown Correction

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase4-workflow --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase4-workflow/20260718T031304467Z
```

The workflow now exercises app teardown through the production renderer lifecycle by reloading the page while master capture is in flight. The app-shell capture controller is registered with the renderer page teardown boundary, and the browser fixture records finalized evidence after page teardown.

| Check | Result |
| --- | --- |
| Workflow status | `passed` |
| Lifecycle exercised | production `beforeunload`/`pagehide` plus real page reload |
| App teardown `commitDelta` | `0` |
| App teardown `stoppedTrackDelta` | `1` |
| App teardown `peerCloseDelta` | `1` |
| Removed private teardown route in source/bundles | `absent` |

## Phase 4 P95 Enforcement Addendum

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase4-workflow --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase4-workflow/20260718T032744932Z
```

The workflow keeps one explicit cold warm-up measurement, then collects 20 already-authorized shell click-to-local-recording samples for each provider-delay cohort. It now calculates nearest-rank p95 for each cohort and fails if either p95 exceeds `100 ms` or if the absolute p95 difference exceeds `1000 / 60 ms`.

| Provider setup delay | Cohort size | Click-to-local-recording samples | Nearest-rank p95 |
| ---: | ---: | --- | ---: |
| 0 ms | 20 | 61.5, 81.2, 30.6, 45.5, 51.9, 67.1, 82.9, 28.2, 44.5, 59.2, 75.7, 25.2, 37.7, 45.9, 56.6, 70.0, 80.7, 30.1, 39.1, 51.3 ms | 81.2 ms |
| 1,500 ms | 20 | 61.8, 33.7, 84.1, 55.3, 63.4, 35.4, 50.0, 21.8, 79.0, 42.5, 26.3, 81.3, 57.8, 31.1, 25.8, 73.7, 46.9, 70.9, 33.1, 77.2 ms | 81.3 ms |

| Check | Result |
| --- | --- |
| 0 ms p95 budget | `81.2 ms <= 100 ms` |
| 1,500 ms p95 budget | `81.3 ms <= 100 ms` |
| Absolute p95 difference | `0.1 ms <= 16.666666666666668 ms` |
| Workflow status | `passed` |

## Phase 4 Final Audit Correction

Workflow:

```text
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase4-workflow --skip-build
```

Artifact:

```text
.recordings/instant-voice-capture-phase4-workflow/20260718T043223381Z
```

The final-audit failure at `.recordings/instant-voice-capture-phase4-workflow/20260718T041837686Z` was caused by the browser fixture's interval-sampled analyser missing one short processed-track marker. The Phase 4 fixture now installs a normal AudioWorklet probe for the processed media stream and the workflow asserts that finished captures observe `processed_audio_marker_observed` through that worklet path.

The cohort collection also alternates provider delays and waits 120 ms after the shell returns idle before taking the next sample. The measured interval still starts at `capture_click`; the settle keeps the p95 comparison from attributing previous-sample audio teardown overlap to one provider-delay cohort.

| Provider setup delay | Cohort size | Click-to-local-recording samples | Nearest-rank p95 |
| ---: | ---: | --- | ---: |
| 0 ms | 20 | 26.3, 30.8, 32.5, 32.5, 32.0, 31.7, 26.0, 28.8, 26.5, 28.8, 29.1, 29.3, 28.7, 28.3, 24.8, 28.7, 24.4, 27.5, 56.1, 26.3 ms | 32.5 ms |
| 1,500 ms | 20 | 28.7, 28.1, 26.8, 27.2, 26.7, 26.6, 26.2, 26.7, 25.8, 26.5, 26.4, 24.7, 23.7, 25.3, 24.5, 50.1, 26.4, 23.8, 24.9, 27.5 ms | 28.7 ms |

| Check | Result |
| --- | --- |
| 0 ms p95 budget | `32.5 ms <= 100 ms` |
| 1,500 ms p95 budget | `28.7 ms <= 100 ms` |
| Absolute p95 difference | `3.8 ms <= 16.666666666666668 ms` |
| Processed marker observer | `AudioWorklet` |
| Workflow status | `passed` |
