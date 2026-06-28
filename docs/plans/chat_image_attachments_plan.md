# Chat Image Attachments Plan

## Goal

Support attaching images to chat messages with a native desktop UX:

- attach button opens an image file picker;
- drag and drop onto the composer attaches images;
- pasted clipboard images attach when Electron exposes usable image data;
- attached images render as small thumbnail chips near the composer;
- sent user messages render text plus image thumbnails in the transcript.

The implementation should preserve images as structured message parts from the
renderer through persistence, queueing, steering, replay, and Codex delivery. It
should not encode image attachments into prompt text.

## Product Contract

- Users can attach one or more image files before sending a message.
- Users can remove an attached image before sending.
- The composer accepts image file drops over the input area.
- The composer accepts image paste when clipboard image data is available.
- Each pending attachment shows a stable thumbnail, filename or fallback label,
  upload/processing state, and a remove control.
- A message containing only images is valid if at least one image attachment is
  present.
- Sent user messages show the text and image thumbnails in their original
  authored order.
- Transcript thumbnails have fixed dimensions and do not resize transcript rows
  unpredictably after load.
- Clicking a sent thumbnail opens a larger preview or image details view owned by
  the app, not direct browser navigation.
- Search and transcript text extraction search text parts only. Images may
  contribute filename/alt metadata later, but not through heuristic OCR or model
  summaries.
- If the selected provider/model cannot accept images, the app should reject the
  send before losing the draft and explain the limitation.

## Non-Goals

- Do not support remote HTTP or HTTPS image URLs as user attachments.
- Do not store full original image data URLs inside message JSON or transcript
  blocks.
- Do not represent attachments by asking users to type file paths.
- Do not implement OCR, image caption generation, or semantic image search.
- Do not add legacy compatibility paths, dual-read/write storage, or silent
  fallbacks for old message shapes.
- Do not manually edit generated TypeScript outputs.

## Current State

Setta's chat path is currently text-first:

- HTTP request contracts for send, queue, edit queued, and steer carry a
  `prompt` string.
- IPC/preload/store/composer APIs also carry a `prompt` string.
- `chat.TurnRequest` carries `Prompt string`; `chat.SteerRequest` carries
  `Text string`.
- `ChatMessage.Parts` exists, but `MessagePart` currently supports only
  `type: "text"`, with `text` and `format` fields.
- Renderer message display uses `chatMessageText(message)` and concatenates all
  part text.
- Codex app-server schema already supports structured `text`, `image`, and
  `localImage` user inputs for `turn/start` and `turn/steer`.

The missing layer is Setta's own structured chat input and attachment storage
model.

## Codex Compatibility

Reference implementation: `/Users/kevin/Documents/AppDevelopment/reference_repos/codex`.
That checkout should be re-inspected before implementation because it is an
external reference, not a vendored dependency or generated contract source.

Codex supports two relevant user input forms:

- `image`: a pre-encoded data URL;
- `localImage`: a local filesystem path plus optional detail hint.

Setta should use `localImage` as the normal Codex delivery form. Picked,
dropped, and pasted images should first be copied or written into a stable Setta
attachment store under app data. The Codex harness can then pass those app-owned
local paths to `turn/start` or `turn/steer`.

Use data URLs only as a narrow transport fallback if a future integration truly
requires it. They are a poor durable representation because they inflate message
JSON, hurt transcript performance, and make persistence and previews harder to
bound.

Relevant Codex reference files:

- `codex-rs/protocol/src/user_input.rs`: structured `UserInput` variants for
  text, data URL images, and local image paths.
- `codex-rs/protocol/src/models.rs`: conversion from local image paths into
  model-facing image content.
- `codex-rs/core/src/image_preparation.rs`: image resizing, data URL
  preparation, and rejection behavior for unsupported image inputs.
- `codex-rs/app-server/src/request_processors/turn_processor.rs`: app-server
  validation that rejects remote HTTP(S) image URLs.
- `codex-rs/cli/src/main.rs` and `codex-rs/exec/src/lib.rs`: CLI `--image`
  inputs mapped to `UserInput::LocalImage`.
- `codex-rs/tui/src/bottom_pane/chat_composer/attachment_state.rs` and
  `codex-rs/tui/src/chatwidget/input_submission.rs`: TUI attachment state and
  structured submit behavior. Use these for lifecycle ideas, not for Setta's
  literal GUI layout.

## Target Data Model

Introduce Go-owned structured input and message parts, then regenerate
TypeScript contracts.

Suggested authored input shape:

```go
type ChatInputPart struct {
    ID    string            `json:"id"`
    Type  ChatInputPartType `json:"type"`
    Text  *ChatTextInput    `json:"text,omitempty"`
    Image *ChatImageInput   `json:"image,omitempty"`
}

type ChatTextInput struct {
    Text   string     `json:"text"`
    Format TextFormat `json:"format"`
}

type ChatImageInput struct {
    AttachmentID string       `json:"attachmentId"`
    Detail       *ImageDetail `json:"detail,omitempty"`
}
```

Suggested persisted message part shape:

```go
type MessagePart struct {
    ID     string          `json:"id"`
    Type   MessagePartType `json:"type"`
    Text   string          `json:"text,omitempty"`
    Format TextFormat      `json:"format,omitempty"`
    Image  *ImagePart      `json:"image,omitempty"`
}

type ImagePart struct {
    AttachmentID string       `json:"attachmentId"`
    FileName     string       `json:"fileName"`
    MimeType     string       `json:"mimeType"`
    ByteSize     int64        `json:"byteSize"`
    Width        int          `json:"width"`
    Height       int          `json:"height"`
    Detail       *ImageDetail `json:"detail,omitempty"`
}
```

The exact generator-friendly shape can change, but the renderer-facing contract
should be discriminated by part type. Validation must enforce that exactly the
fields for the active part type are populated.

## Attachment Storage

Add an app-owned attachment store separate from message JSON.

Recommended properties:

- Original image bytes are copied into app data under a workspace/conversation
  scoped attachment directory.
- Attachment IDs are generated by Setta and are stable across restarts.
- Store metadata records include original filename when available, MIME type,
  byte size, dimensions, content hash, created time, and relative file path.
- Generate a bounded thumbnail or preview asset for renderer display.
- Do not rely on the source file path after attach. The original file may move,
  be deleted, or become inaccessible.
- Pasted clipboard images are written to the same store with a synthesized
  filename.
- Validate file type by decoding image data, not only extension.
- Enforce maximum file size, maximum dimensions, and maximum attachment count per
  message before the turn starts.

Prefer storing original and thumbnail files on disk plus small metadata JSON in
the existing workspace/conversation store conventions. Avoid embedding binary
payloads in state files.

## Renderer UX

Composer behavior:

- Add an icon button beside the composer controls for image attachment.
- Use Electron/native file selection, restricted to supported image types.
- Handle drag enter/over/drop on the composer surface and show a restrained drop
  affordance only while dragging image files.
- Handle paste events from the composer; if clipboard image data exists, create
  an attachment through the preload/backend path.
- Show pending image chips in a horizontal wrapping strip above or inside the
  composer chrome, not inside the textarea text value.
- Each chip has a fixed thumbnail box, filename, and remove icon button.
- Failed attachments remain visible with an error state and can be removed.
- Sending is disabled while any attachment is still being copied/validated.

Transcript behavior:

- Render user message parts in authored order.
- Text parts use the existing user text renderer.
- Image parts render as fixed-size thumbnails with filename/details available on
  hover or in the preview view.
- Thumbnail loading must not create large layout shifts in virtualized rows.
- Row actions that edit, queue edit, or retry a message must restore both text
  and image parts.

## Backend Flow

Attach flow:

1. Renderer asks preload/main/backend to create an attachment from a selected,
   dropped, or pasted image.
2. Backend validates and copies/writes the file into the attachment store.
3. Backend creates thumbnail metadata and returns an attachment descriptor.
4. Composer keeps descriptors in local draft state.
5. Send/queue/steer submits structured parts referencing attachment IDs.

Send flow:

1. Validate request has at least one non-empty text part or image part.
2. Persist the user message with text and image parts.
3. Create the run and assistant message as today.
4. Build `TurnRequest` from structured parts rather than a single prompt.
5. Convert text parts into Codex `type: "text"` inputs.
6. Convert image parts into Codex `type: "localImage"` inputs using attachment
   store paths.
7. Prepend semantic context as an additional text input, preserving authored
   image order after the context.

Queue and steering flow:

- Queued messages store the same structured parts as normal messages.
- Promoting queued work replays those structured parts.
- Steering accepts structured parts only if the Codex app-server path supports
  `turn/steer` images for the active model; otherwise reject before draft loss.
- Immediate steering replay must preserve image parts when replaying the user
  message that caused the restart.

## Contract Updates

Update Go-owned contracts and regenerate TypeScript:

- `SendChatMessageRequest`
- `QueueChatMessageRequest`
- `EditQueuedChatMessageRequest`
- `SteerChatMessageRequest`
- `SendSteeringImmediatelyRequest`, if image steering is supported there
- `ChatMessage`
- `MessagePart`
- any generated transcript message projections that expose message parts

Do not add a separate frontend-only type list. The Go contract remains the
owner.

## Validation Rules

- Supported formats: start with PNG, JPEG, WebP, and GIF only if the downstream
  image pipeline supports it reliably. Treat unsupported formats as attach
  errors.
- Reject zero-byte files and invalid image data.
- Reject remote URLs.
- Reject files over the configured size limit.
- Reject dimensions over the configured limit unless the backend resizes into a
  bounded original copy.
- Reject more than the configured number of images per message.
- Reject image sends when the active provider/model does not support image
  inputs.
- Fail specifically; do not silently drop invalid attachments.

## Implementation Phases

### Phase 1: Contracts and Storage

- Add structured input/message part contracts in Go.
- Add attachment metadata and file storage helpers.
- Add backend validation for image files and pasted image bytes.
- Regenerate TypeScript contracts.
- Add focused Go tests for validation, store persistence, and message part
  validation.

### Phase 2: IPC and Renderer Draft State

- Update IPC/preload/store methods to accept structured message input.
- Add attachment creation APIs for selected files, dropped files, and clipboard
  bytes.
- Add composer attachment state and thumbnail chip rendering.
- Keep text-only sends behaviorally unchanged through the new structured path.

### Phase 3: Transcript Rendering and Editing

- Render mixed text/image message parts.
- Update `chatMessageText` usage into explicit text extraction helpers for
  search, titles, edit drafts, and command comparisons.
- Update queued edit/retry/row actions to restore structured parts.
- Add fixed-size thumbnail layout and preview interactions.

### Phase 4: Codex Harness Delivery

- Change `TurnRequest` and `SteerRequest` to carry structured input parts.
- Map Setta image parts to Codex `localImage` input.
- Keep semantic context as explicit text input rather than concatenating images
  into prompt text.
- Add fake Codex app-server assertions for `turn/start` and `turn/steer` image
  payloads.

### Phase 5: Workflow Coverage and Hardening

- Cover send, queue, queued promotion, steering, cancel/restart replay, reload,
  and transcript pagination with deterministic Electron E2E.
- Add tests for source-file deletion after attach; Setta should still send the
  stored app-owned copy.
- Add tests for invalid image rejection and unsupported model/provider rejection.
- Run live Codex E2E when local ChatGPT auth is available.

## Tool Summary Expand-All

The image attachment work is independent from the tool summary accordion polish,
but both touch chat UX. Keep the expand-all work small and separate:

- Add a compact per-group bulk expand/collapse button on the activity group
  header.
- Avoid nested buttons by splitting the group disclosure button from the bulk
  icon button.
- Expanding all opens the group and expands every expandable member row.
- Collapsing all collapses member row details without changing unrelated groups.
- Hide the control when a group has no expandable rows.

This should remain renderer-only unless existing group row data cannot identify
member expandable IDs.

## Verification

Because this changes chat behavior, renderer chat state, preload/IPC contracts,
Codex harness payloads, persistence, queueing, steering, event streaming, and
transcript UI, implementation requires deterministic end-to-end app workflow
tests through production Electron/main/preload/renderer/HTTP/store paths.

Minimum checks after implementation:

- regenerate affected generated outputs;
- focused Go tests for chat validation/store/harness mapping;
- focused renderer tests for composer attachment state and transcript rendering;
- deterministic Electron E2E for attach/send/queue/steer/reload;
- live Codex E2E when ChatGPT auth is available;
- `./scripts/format.sh`;
- `./check_quality.sh --git-changes`.

For this planning-only document, automated implementation checks are not
required.
