/* @vitest-environment jsdom */

import { act, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatAttachmentList } from "./chatAttachmentPreviews";

describe("ChatAttachmentList", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("renders highlighted attachment labels through the extracted attachment surface", async () => {
    await act(async () => {
      root.render(
        <ChatAttachmentList
          attachments={[
            {
              id: "attachment-highlight",
              name: "release-plan.md",
            },
          ]}
          isUser={false}
          attachmentUrlMap={{}}
          requestAttachmentUrls={async () => ({})}
          renderAttachmentName={(name) => {
            const [beforeMatch, afterMatch] = name.split("release");
            return (
              <Fragment>
                {beforeMatch}
                <mark data-chat-search-highlight="true">release</mark>
                {afterMatch}
              </Fragment>
            );
          }}
        />,
      );
    });

    // Highlight rendering should stay with the attachment owner instead of the parent chat surface.
    expect(host.innerHTML).toContain('data-chat-search-highlight="true"');
    expect(host.innerHTML).toContain(">release</mark>-plan.md");
  });

  it("opens the extracted preview dialog for archive attachments without a downloadable preview", async () => {
    await act(async () => {
      root.render(
        <ChatAttachmentList
          attachments={[
            {
              id: "archive-attachment",
              name: "release-bundle.zip",
              mimeType: "application/zip",
              size: 4096,
            },
          ]}
          isUser={true}
          attachmentUrlMap={{}}
          requestAttachmentUrls={async () => ({})}
        />,
      );
    });

    const attachmentButton = host.querySelector(
      '[role="button"]',
    ) as HTMLDivElement | null;
    expect(attachmentButton).not.toBeNull();

    if (!attachmentButton) {
      throw new Error("Expected attachment button.");
    }

    await act(async () => {
      attachmentButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    // Opening the dialog should preserve the archive fallback copy and metadata.
    expect(document.body.textContent).toContain("Attachment preview");
    expect(document.body.textContent).toContain("release-bundle.zip");
    expect(document.body.textContent).toContain(
      "Archive preview not available.",
    );
  });
});
