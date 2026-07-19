import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  EasyButtonTerminalSummary,
  type EasyButtonTerminalSummaryRecord,
} from "./easy-button-terminal-summary";

describe("Easy Button conversation terminal summary", () => {
  test("renders the exact persisted final-summary and source turn", () => {
    const html = renderToString(<EasyButtonTerminalSummary summary={summary("completed")} />);

    expect(html).toContain('data-easy-button-summary-source="summary_topic"');
    expect(html).toContain('data-easy-button-summary-turn="turn_topic"');
    expect(html).toContain("Topic work is complete.");
    expect(html).toContain("easy-button-summary-ok");
  });

  test.each(["cancelled", "failed"] as const)(
    "does not present a %s turn as successful",
    (status) => {
      const html = renderToString(<EasyButtonTerminalSummary summary={summary(status)} />);
      expect(html).not.toContain("easy-button-summary-ok");
    },
  );

  test("renders no terminal channel when the narrator has not produced one", () => {
    expect(renderToString(<EasyButtonTerminalSummary summary={null} />)).toBe("");
  });
});

function summary(
  status: EasyButtonTerminalSummaryRecord["status"],
): EasyButtonTerminalSummaryRecord {
  return {
    id: "summary_topic",
    status,
    text: "Topic work is complete.",
    turnId: "turn_topic",
  };
}
