import type { CustomRunItem } from "state/stores/projectStatusStores";
import { describe, expect, it } from "vitest";

import {
  findCustomRunById,
  findCustomRunForCodeBlock,
  getCustomRunDropdownRuns,
  hasEntryCustomRun,
  hasListenerRefreshCustomRun,
} from "./customRunQueries";

const runs: Array<CustomRunItem> = [
  {
    id: "entry-run",
    name: "Entry run",
    includeInRunDropdown: true,
    runMode: "once",
    action: { type: "runCodeBlock", sectionId: null },
  },
  {
    id: "listener-refresh",
    name: "Listener refresh",
    includeInRunDropdown: false,
    runMode: "continuous",
    action: { type: "triggerListenerForceRefresh" },
  },
  {
    id: "section-run",
    name: "Section run",
    includeInRunDropdown: true,
    runMode: "once",
    action: { type: "runCodeBlock", sectionId: "section-1" },
  },
];

describe("customRunQueries", () => {
  it("filters dropdown runs without altering the stored run order", () => {
    // The run button dropdown should derive its visible rows from the persisted run list without reordering them.
    expect(getCustomRunDropdownRuns(runs).map((run) => run.id)).toEqual([
      "entry-run",
      "section-run",
    ]);
  });

  it("finds runs by id and by code block section", () => {
    // Execution and authoring flows should reuse the same run records instead of recreating them.
    expect(findCustomRunById(runs, "section-run")?.name).toBe("Section run");
    expect(findCustomRunForCodeBlock(runs, "section-1")?.id).toBe(
      "section-run",
    );
    expect(findCustomRunForCodeBlock(runs, "section-missing")).toBeUndefined();
  });

  it("detects whether the built-in entry and listener refresh runs already exist", () => {
    // Default seeding should only add missing built-ins, never duplicate the existing ones.
    expect(hasEntryCustomRun(runs)).toBe(true);
    expect(hasListenerRefreshCustomRun(runs)).toBe(true);
    expect(hasEntryCustomRun(runs.slice(1))).toBe(false);
    expect(hasListenerRefreshCustomRun([runs[0], runs[2]])).toBe(false);
  });
});
