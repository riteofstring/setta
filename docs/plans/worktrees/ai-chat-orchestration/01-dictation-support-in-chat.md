# Dictation Support In Chat

## Goal
Allow chat input via dictation/audio input where supported by provider/environment.

## Scope
- In scope: mic input controls, transcript insertion into chat input, provider capability handling.
- Out of scope: full voice-agent conversation mode.

## Plan
1. Define dictation capability detection and UI states.
2. Add mic control in chat input area and transcript insertion behavior.
3. Handle start/stop/error states with clear feedback.
4. Ensure typed and dictated inputs can be combined cleanly.

## Acceptance Criteria
- Users can dictate chat input when capability is available.
- Transcript lands in the chat input with predictable editing behavior.

## Verification
- Add tests for dictation state transitions.
- Add Playwright scenario for enabling dictation flow where testable.
- CDP visual check for chat input controls.
