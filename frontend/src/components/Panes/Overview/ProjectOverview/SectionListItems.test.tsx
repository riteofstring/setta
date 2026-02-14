import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionListItems } from "./SectionListItems";

function renderSectionList(markupProps: Parameters<typeof SectionListItems>[0]) {
  return renderToStaticMarkup(
    <ul>
      <SectionListItems {...markupProps} />
    </ul>,
  );
}

describe("SectionListItems", () => {
  it("shows an AI working indicator when the section is actively running", () => {
    // Active section ids from agent runs should surface directly in the overview row.
    const markup = renderSectionList({
      listOfSectionIdsAndNames: [
        {
          id: "section-active",
          name: "Active Section",
          depth: 0,
          tagColor: null,
          aiWorking: false,
        },
        {
          id: "section-idle",
          name: "Idle Section",
          depth: 0,
          tagColor: null,
          aiWorking: false,
        },
      ],
      activeSectionIds: new Set(["section-active"]),
    });

    expect(markup).toContain('data-testid="overview-ai-working-section-active"');
    expect(markup).not.toContain('data-testid="overview-ai-working-section-idle"');
  });

  it("shows an AI working indicator for chat rows waiting on a response", () => {
    // Chat-level waiting state should also map to the same indicator.
    const markup = renderSectionList({
      listOfSectionIdsAndNames: [
        {
          id: "section-chat",
          name: "Chat Section",
          depth: 0,
          tagColor: null,
          aiWorking: true,
        },
      ],
    });

    expect(markup).toContain('data-testid="overview-ai-working-section-chat"');
  });
});
