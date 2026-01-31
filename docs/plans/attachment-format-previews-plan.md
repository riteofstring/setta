# Attachment Format Previews Plan

## Goals
- Provide consistent, polished previews for common attachment formats in the chat carousel/modal and future surfaces (e.g., browser section).
- Make non-image attachments understandable without forcing users to open a new tab.
- Keep preview behavior and styling consistent across user and assistant messages.

## Scope
- Define preview strategies per format family.
- Identify minimal backend data needed for previews.
- Define frontend components, layout rules, and fallbacks.
- Document testing and rollout steps.

## Non-Goals
- No full file editors.
- No server-side rendering of complex formats (e.g., Office) in phase 1.
- No changes to attachment storage or permissions.

## Format Families and Preview Strategy

### Images (png/jpg/webp/gif)
- Preview: full image with object-contain and background frame.
- Thumbnails: existing generated image or scaled URL.
- Actions: open in new tab, download (if available).

### Text (txt/md/json/csv/py/toml/yaml/log)
- Preview: inline scrollable text panel with line numbers and syntax highlighting for known types.
- Truncation: show first N KB with "View full file" action.
- Actions: open in new tab, copy, download.

### PDF
- Preview: first page rendered in a PDF viewer (client-side) if size under threshold; fallback to icon card.
- Actions: open in new tab, download.

### Audio (mp3/wav/ogg)
- Preview: compact audio player with waveform placeholder and duration if known.
- Actions: play/pause, open in new tab.

### Video (mp4/webm)
- Preview: video element with poster (if provided) and play button; fallback to icon card.
- Actions: open in new tab.

### Archives (zip/tar/gz)
- Preview: icon card with filename, size, and top-level entries if index is available.
- Actions: download.

### Unknown/Binary (application/octet-stream)
- Preview: icon card with filename and size.
- Actions: open in new tab.

## Backend/Data Plan
- Add lightweight preview metadata to attachment response (when feasible):
  - textSnippet (string, optional, size-limited)
  - textMime (string, optional)
  - pdfFirstPageUrl (string, optional)
  - mediaPosterUrl (string, optional)
  - mediaDuration (number, optional)
- Ensure MIME detection includes common text types (toml, yaml, md, json, csv).
- Keep access control unchanged; all preview assets go through existing attachment auth.

## Frontend Plan
- Extend shared `MediaCarousel` to accept optional `previewType` and `previewData`.
- Add `AttachmentPreviewCard` component for non-image previews:
  - icon + filename + size + mime
  - optional snippet/metadata block
- Add `TextPreviewPanel` component:
  - scrollable region, monospaced font, syntax highlight for known types
  - truncation indicator + open-full action
- Add `PdfPreviewPanel` component:
  - lazy-load via pdf.js if size < threshold; fallback to icon card
- Add `AudioPreviewPanel` / `VideoPreviewPanel` using native HTML media tags.
- Keep modal height fixed; use internal scroll for long content.

## UX Rules
- Always show filename and size for non-image previews.
- Keep preview area height fixed; media uses object-contain.
- Thumbnails always have pointer cursor and focus styles.
- Keyboard navigation: left/right to change items, Esc to close modal.

## Accessibility
- All previews have alt text or ARIA labels.
- Focus trap inside modal; keyboard navigation works with arrows and Enter/Space.
- Ensure contrast for preview labels and buttons.

## Performance
- Lazy-load heavy previews (pdf/media) only when selected.
- Limit text preview bytes; avoid rendering huge blobs.
- Cache preview URLs in existing attachment URL map.

## Testing
- Unit: preview type routing for each MIME.
- UI: chat modal renders image, text, and unknown types correctly.
- Manual: verify fixed modal height with mixed attachments.
- Regression: ensure browser carousel visuals unchanged.

## Rollout
- Phase 1: text, image, unknown/binary.
- Phase 2: PDF and audio/video.
- Phase 3: archive introspection.

## Open Questions
- Should PDF rendering be server-side or client-side only?
- Do we want per-tenant size thresholds for preview generation?
- Should download be exposed in chat UI or only in modal?
