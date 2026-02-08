# App Gen Style Image + App Preview Responsiveness Plan

## Goals
- Allow attaching a **style reference image** from the App Config pane (Generate App flow) so the model can follow a visual direction without the user needing to attach it manually in chat.
- Ensure the attached style image is **prefilled into the Project chat input** when Generate App opens the chat pane.
- Fix the **App Preview** horizontal cut-off issue (left-edge clipping) by preventing accidental horizontal scrolling and resetting scroll position.

## Non-Goals (For This Pass)
- Figma MCP integration or image-to-Figma workflows.
- A full theme-extraction pipeline (we only pass the image through to the model; the model can choose to set `definition.theme` if asked).

## Implementation Steps
1. **State wiring (AI store)**
   - Extend `useAIStore` with `pendingProjectChatAttachments: ChatFileAttachment[] | null` (non-persisted).

2. **Prefill chat attachments**
   - Update `frontend/src/components/Chat/ChatInput.tsx` to accept `initialAttachments?: ChatFileAttachment[]` and pass it through to `useChatAttachmentManager`.
   - Update `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` to:
     - Consume `pendingProjectChatAttachments`.
     - Store them in a local state (so clearing the store does not clear the UI).
     - Pass them to `ChatInput` as `initialAttachments`.

3. **App Config UI: “Style reference image”**
   - Add a new section under Prompt Builder in `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`:
     - File input `accept="image/*"` with clear/replace behavior.
     - Upload selected image using the existing artifact pipeline (`route_binary_upload` + `route_update_artifacts` with `uploadScope: "chat"`).
     - Provide a small preview + filename/size once uploaded.
     - Disable Generate App while an upload is in progress.
   - On Generate App click:
     - Seed both `pendingProjectChatPrompt` and `pendingProjectChatAttachments`.
     - Append a short note to the prompt indicating the attachment is a **style reference**.
     - Clear the App Config “style image” UI state (ownership transfers to chat).

4. **App Preview: prevent clipping**
   - Update `frontend/src/components/Pages/Project/AppPreview.tsx`:
     - Use `overflow-y-auto overflow-x-hidden` (avoid accidental horizontal scroll).
     - Reset `scrollLeft` to `0` on mount / spec changes to prevent left-edge cut-off if the container was scrolled.

5. **Tests + Verification**
   - Vitest:
     - Extend `frontend/src/components/Chat/ChatInput.test.tsx` with a case that verifies prefilled attachments render.
   - Playwright:
     - Add a new E2E spec that attaches a style image in App Config, clicks Generate App, and asserts the chat input shows the attachment chip.
   - Run:
     - `pnpm -C frontend exec vitest run src/components/Chat/ChatInput.test.tsx`
     - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/<new-spec>.spec.ts`
   - CDP visual check:
     - Verify App Config shows the style image UI, Generate App brings it into chat, and App Preview no longer clips content on the left.

