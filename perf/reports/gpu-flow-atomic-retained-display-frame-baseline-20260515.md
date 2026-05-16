# GPU Flow Atomic Retained Display Frame Baseline - 2026-05-15

Before-refactor recording:

- Recording: `recording-20260515-092316`
- Artifact directory: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260515-092316`
- Source command: `./scripts/latest-chrome-recording.sh --json`

Baseline signals from the recording:

- Retained scroll flushes: 337 events, average about `0.008ms`, max about `0.2ms`.
- Retained frame publication pressure: 228 GPU Flow frames with missing retained pages, 206 frames with uncovered retained rects, max missing retained pages `94`, and 191 frames exhausted the retained page budget.
- Retained page memory pressure: about `981MB` committed.
- Passive text-like visibility: snapshot count ranged from 132 to 403, ready passive rows dropped to zero in two snapshot events, and blank passive rows peaked at 389.
- Recording-wide cadence risk: 52 frame-gap events averaged about `59.8ms`, max about `258.3ms`; 14 long tasks averaged about `89.2ms`, max about `182ms`.

Refactor target:

- Prepared retained frames with missing visible coverage must not replace the published display frame.
- Visible content should remain present during text input activation, high zoom page pressure, and retained section scrolling.
- After reports should record whether verification was a true 120 Hz-capable run or a refresh-aware capped run.
