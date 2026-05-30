# Embedded Code String Remediation Plan

## Objective

Remove large blocks of executable code embedded in string literals while keeping
the current ownership model intact:

- Go remains the owner of backend contracts.
- Generated TypeScript surfaces remain generated.
- Stable runtime code should live in normal source files where it can be
  formatted, linted, typechecked, and tested.
- String literals should be reserved for small fragments, exact test fixtures,
  or APIs that explicitly require source text.

## Current Inventory

The current real cases are:

- `cmd/generate-contracts/main.go`
  - emits stable TypeScript decoder helpers as raw string blocks
  - emits stable backend client runtime code as a raw string block
- `desktop/src/main/browser-pane.ts`
  - passes a JavaScript source string to `webContents.executeJavaScript`
- Go tests for persisted JSON
  - use small raw JSON fixtures where exact malformed bytes matter
- desktop tests
  - use small inline `node -e` snippets and JSON payload fixtures

The generator is the main cleanup target. The browser pane source string is
acceptable for now only because Electron requires JavaScript source for
`executeJavaScript`, but it should stay small.

## Non-Goals

- Do not replace the current Go-owned contract generator with a larger codegen
  framework.
- Do not manually edit generated outputs.
- Do not add backward compatibility paths.
- Do not remove small exact-byte fixtures from tests when the fixture itself is
  the behavior under test.
- Do not add heuristic parsing or best-effort generated-client behavior.

## Target Shape

Stable code should be normal source code. Generated code should contain only the
pieces that vary by contract.

For the backend contract generator:

- Move stable TypeScript runtime helpers out of generated output.
- Keep generated output focused on interfaces, endpoint descriptors, and
  contract-specific decoder functions.
- Import hand-written helpers from a normal TypeScript module.
- Keep the hand-written helpers covered by TypeScript unit tests.

For Electron/browser code:

- Keep `executeJavaScript` snippets small.
- If browser-pane inspection grows, move the inspected-page logic into a normal
  preload or page helper instead of expanding the inline source string.

For tests:

- Keep small malformed JSON strings inline when exact bytes are the test case.
- Move larger scripts or structured fixtures into helper functions or fixture
  files.

## Work Order

1. Add a hand-written generated-backend runtime module.
   - Suggested path: `desktop/src/main/backend-runtime.ts` or
     `desktop/src/shared/backend-runtime.ts`.
   - Own helpers such as object assertions, primitive decoders, array decoding,
     unknown-field checks, and generic backend request execution.
   - Export only the helpers the generated file needs.

2. Update `cmd/generate-contracts`.
   - Stop emitting stable decoder helper blocks.
   - Stop emitting the generic `requestBackend` block.
   - Emit imports for the hand-written runtime helpers.
   - Continue emitting generated interfaces, endpoint descriptors,
     contract-specific decoders, and typed client operation wiring if that wiring
     remains contract-specific.

3. Regenerate contracts.
   - Run `./scripts/go.sh run ./cmd/generate-contracts`.
   - Confirm `desktop/src/generated/backend.ts` no longer contains large stable
     helper blocks.

4. Move or tighten tests around generated-client runtime behavior.
   - Keep generated client behavior tests.
   - Add direct tests for the hand-written backend runtime helpers if behavior
     moved out of generated output.
   - Avoid tests that only restate generated code.

5. Review the browser pane inline JavaScript.
   - Keep it if it remains a small Electron-required snippet.
   - If it grows beyond a compact inspection snippet, create a normal helper
     script/module and call into that surface instead.

6. Review test fixtures.
   - Leave short malformed JSON fixtures inline.
   - Move larger executable snippets into named helpers or fixture files.

7. Verify.
   - Run `./scripts/go.sh run ./cmd/generate-contracts`.
   - Run `./scripts/format.sh`.
   - Run `./check_quality.sh --all`.
   - Run `./scripts/check_supply_chain.sh`.
   - Run `pnpm -C desktop smoke:browser` because the generated client and browser
     pane are in scope.

## Acceptance Criteria

- `cmd/generate-contracts/main.go` no longer contains large raw TypeScript code
  blocks for stable helper/runtime code.
- `desktop/src/generated/backend.ts` imports stable runtime helpers instead of
  defining them inline.
- Generated TypeScript still fails loudly on malformed or unknown backend
  payload fields.
- The browser pane does not accumulate large inline executable source strings.
- Small exact-byte JSON test fixtures remain allowed.
- Regeneration leaves the working tree clean.
- The full quality, supply-chain, and Electron smoke checks pass.
