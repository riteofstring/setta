# Voice Input in Chat

## Goal
Allow users to populate chat input via dictation/audio input when the selected provider or browser environment supports it.

## Scope
- In scope: mic control in chat input, capability detection, transcript insertion at cursor position, and start/stop/error feedback.
- Out of scope: full duplex voice conversation mode and speech synthesis.

## Plan
1. Define a capability matrix for supported runtime/provider dictation paths and expose a single UI availability flag.
2. Add a mic action to the chat composer controls and wire start/stop/cancel transitions.
3. Insert transcript text into the existing chat input model without breaking typed editing behavior.
4. Surface deterministic user feedback for denied permissions, unsupported runtime, and recognition failures.

## Acceptance Criteria
- Dictation control appears only when capability is available and behaves predictably across start/stop flows.
- Transcript text is inserted in chat input with predictable caret/selection behavior and can be edited before send.

## Verification
- Add unit tests for availability logic and dictation state transitions.
- Add Playwright coverage for composer control visibility and non-hardware-dependent flow where feasible.
- CDP visual check for chat input controls.
