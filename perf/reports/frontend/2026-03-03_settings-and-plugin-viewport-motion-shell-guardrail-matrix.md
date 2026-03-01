# Viewport Motion-Shell Guardrail Matrix

Date: 2026-03-03
Area: frontend
Implementation status: **Guardrails added and passing on initial matrix.**

## Goal

Validate the motion-shell path across more than one surface before any default-on decision.

## Matrix Scope

1. `Settings -> All Settings` (heavy settings view)
2. `Settings -> Param Defaults` (secondary settings view)
3. Non-settings heavy canvas via plugin fixture (`~100` plugin sections)

## New Guardrail Specs

- `frontend/tests/e2e/settings/settings-all-settings-viewport-motion-shell-guardrail.spec.ts`
  - now covers both `All Settings` and `Param Defaults` in one spec.
- `frontend/tests/e2e/overview/plugins/plugin-sections-viewport-motion-shell-guardrail.spec.ts`
  - heavy non-settings canvas A/B guardrail using fixture plugin sections.

## Commands Run

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-viewport-motion-shell-guardrail.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/plugins/plugin-sections-viewport-motion-shell-guardrail.spec.ts`

## Results

### A) Settings - All Settings

- Control:
  - `pan=37.3`, `zoom=36.7`
  - `start p95=4.2ms`, `stop p95=5.1ms`
- Motion shell:
  - `pan=111.3`, `zoom=105.0`
  - `start p95=5.4ms`, `stop p95=8.6ms`
- Delta:
  - pan `2.98x`, zoom `2.86x`

### B) Settings - Param Defaults

- Control:
  - `pan=120.4`, `zoom=121.1`
  - `start p95=4.2ms`, `stop p95=9.0ms`
- Motion shell:
  - `pan=120.7`, `zoom=121.0`
  - `start p95=3.0ms`, `stop p95=8.5ms`
- Delta:
  - pan `1.00x`, zoom `1.00x` (near parity, no regression)

### C) Plugin Heavy Canvas (~100 sections)

- Control:
  - `pan=70.8`, `zoom=59.7`
  - `start p95=2.9ms`, `stop p95=18.6ms`
- Motion shell:
  - `pan=118.0`, `zoom=114.4`
  - `start p95=8.2ms`, `stop p95=8.9ms`
- Delta:
  - pan `1.67x`, zoom `1.92x`

## Correctness / Interaction Checks

- All matrix specs enforce:
  - visible-content parity checks between control and motion-shell runs,
  - no active motion-shell state at rest,
  - immediate post-pan interaction readiness on real controls.
- Plugin case verifies post-pan card interaction by checking per-section render count advances after clicking a visible card button.

## Conclusion

- Motion shell guardrails now cover settings + non-settings heavy canvas.
- Initial matrix results support the direction:
  - strong gains on heavy surfaces (`All Settings`, plugin large DOM),
  - parity on lighter secondary settings view (`Param Defaults`).
- Next decision step: controlled default-on trial with kill switch retained.
