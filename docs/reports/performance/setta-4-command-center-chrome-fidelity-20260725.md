# Setta 4 Command Center Chrome Fidelity Check

Date: 2026-07-25

## Scope

This records the focused production-shell check for the Phase 4 chrome/composer
fidelity pass. The source change keeps the Director command center on the
production app path while adjusting only view structure and CSS:

- graph stage fills the viewport under floating top chrome
- top workstream navigation is a compact selected-title group instead of a
  stretched title area
- desktop rails use the mockup's fixed 300 px geometry, with the right rail's
  masked fade and the Now rail's pointer-transparent blank space
- the Director composer separates the `on:` hint from the 620 px command pill
- composer-specific CSS is split into its own checked stylesheet so the touched
  files satisfy changed-file quality limits

## Focused Check

Command:

```sh
node desktop/tests/electron/director-command-center-performance.test.mjs --skip-build --scenario lifecycle --keep-artifacts
```

Result:

```text
laptop/lifecycle frames=145 p95=10.1ms p99=10.4ms max=33.5ms longTasks=0 dom=194 dots=1
Electron Director command-center performance passed: .recordings/director-command-center-performance/20260725T134146488Z
```

The run exercises the production Electron main/preload/HTTP/store/renderer
path with the scripted provider, checks DOM bounds, frame cadence, canvas pixels,
and renderer-console cleanliness, and captures
`.recordings/director-command-center-performance/20260725T134146488Z/lifecycle-laptop.png`.

## Remaining Gates

This is not the Phase 4 exit review. The side-by-side mockup fidelity review on
representative real displays, physical 4K/6K/phone hardware measurements, and
any additional review-driven polish remain release gates.
