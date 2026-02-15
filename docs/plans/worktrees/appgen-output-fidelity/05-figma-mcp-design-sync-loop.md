# Figma MCP Design Sync Loop

## Goal
Support MCP/Figma flows to import existing Figma designs and to roundtrip Setta prompt -> Figma -> Setta.

## Scope
- In scope: Figma MCP integration contracts, import pipeline, roundtrip orchestration.
- Out of scope: full Figma plugin ecosystem support.

## Plan
1. Define MCP operations for pulling Figma design artifacts into Setta.
2. Define roundtrip flow: prompt in Setta, generate in Figma, then pull result back.
3. Handle auth/session requirements and robust error surfacing.
4. Normalize imported design data into app-gen consumable structures.

## Acceptance Criteria
- Existing Figma design can be pulled into Setta app-gen flow.
- Prompted Figma generation can be pulled back and rendered in Setta.

## Verification
- Add integration tests around MCP request/response shaping.
- Add Playwright workflow tests for import and roundtrip sequences.
- CDP check for UI feedback during MCP operations.

## Implementation Notes (February 14, 2026)
- Added MCP mode guidance in backend system prompts, including both Figma paths:
  - pull existing design into Setta
  - generate/update in Figma then pull back into Setta
- Added App Config MCP-mode Figma controls:
  - source input + "Pull Figma Design"
  - design prompt + "Generate In Figma + Pull Back"
- Added hidden chat routing for both actions, preserving mode metadata.

## Verification Notes
- Playwright coverage: `frontend/tests/e2e/overview/app-config-mcp-mode.spec.ts`.
- CDP check was run to verify MCP/Figma controls are present and usable.
