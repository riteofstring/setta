// GENERATED FILE - DO NOT EDIT.
// Source: docs/acceptance/specs/formatting-errors.md
// SourceHash: 3da926cd0a1d78081e985b60b4859fdf45b5f23163a212829d5fcdcbe42db6fa

import { test } from "@playwright/test";
import { runAcceptanceScenario } from "../runner";
import type { AcceptanceScenario } from "../types";

const acceptanceEnabled = process.env.SETTA_ACCEPTANCE === "1";

const scenarios = [
  {
    "feature": "Formatter errors are visible",
    "name": "formatting invalid code shows issues",
    "source": "docs/acceptance/specs/formatting-errors.md",
    "sourceHash": "3da926cd0a1d78081e985b60b4859fdf45b5f23163a212829d5fcdcbe42db6fa",
    "steps": [
      {
        "keyword": "Given",
        "text": "the app is ready"
      },
      {
        "keyword": "And",
        "text": "a new project config exists"
      },
      {
        "keyword": "When",
        "text": "I create a code section named \"Formatter Code\""
      },
      {
        "keyword": "And",
        "text": "I focus the code area for \"Formatter Code\""
      },
      {
        "keyword": "And",
        "text": "I set the code to",
        "docString": "def bad(:\n  pass"
      },
      {
        "keyword": "And",
        "text": "I press \"Alt+Shift+F\""
      },
      {
        "keyword": "Then",
        "text": "I should see \"Failed to run formatter.\""
      },
      {
        "keyword": "And",
        "text": "I open the Issues panel for \"Formatter Code\""
      },
      {
        "keyword": "And",
        "text": "I should see \"Problems\""
      }
    ]
  }
] satisfies AcceptanceScenario[];

test.describe("@acceptance Formatter errors are visible", () => {
  test.skip(!acceptanceEnabled, "SETTA_ACCEPTANCE not set");

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      await runAcceptanceScenario(page, scenario);
    });
  }
});
