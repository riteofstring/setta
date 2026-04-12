import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessageEditor } from "./ChatMessageEditor";

function getTextareaClassName(markup: string): string | null {
  const marker = "<textarea";
  const startIndex = markup.indexOf(marker);
  if (startIndex < 0) {
    return null;
  }
  const classIndex = markup.indexOf('class="', startIndex);
  if (classIndex < 0) {
    return null;
  }
  const valueStart = classIndex + 'class="'.length;
  const valueEnd = markup.indexOf('"', valueStart);
  if (valueEnd < 0) {
    return null;
  }
  return markup.slice(valueStart, valueEnd);
}

function renderEditorMarkup() {
  return renderToStaticMarkup(
    <ChatMessageEditor
      initialText="Edit this"
      initialAttachments={[]}
      onCancel={() => undefined}
      onSave={() => true}
    />,
  );
}

describe("ChatMessageEditor", () => {
  it("keeps light-mode edit text styling inherited and disables textarea scrolling", () => {
    // Editing should preserve the bubble text color and grow instead of showing a vertical scrollbar.
    const markup = renderEditorMarkup();
    const className = getTextareaClassName(markup);

    expect(className).not.toBeNull();
    expect(className).toContain("text-inherit");
    expect(className).toContain("overflow-y-hidden");
    expect(className).toContain("placeholder:text-setta-800/70");
    expect(className).not.toContain("overflow-y-auto");
  });

  it("keeps the edit attachment rail aligned with the first text line", () => {
    const markup = renderEditorMarkup();

    expect(markup).toContain('data-chat-editor-side-rail="true"');
    expect(markup).toContain("absolute left-2 top-1.5");
  });
});
