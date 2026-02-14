import { describe, expect, it } from "vitest";

import { buildAppGenerationPrompt } from "./appGenerationPrompt";

describe("buildAppGenerationPrompt", () => {
  it("includes the provided navigation instructions block", () => {
    const prompt = buildAppGenerationPrompt({
      catalogSummary: "Catalog: setta.app.default (version v1)",
      sectionsSummary: "- Foo (section-1) params: x (param-1)",
      viewModesSummary: "View modes (treat tabs as pages):\n- Home (vm-1)",
      navigationInstructions: ["- Use routes.", "- Do not use Tabs."].join(
        "\n",
      ),
      appSpecStreamingEnabled: false,
    });

    expect(prompt).toContain(
      "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
    );
    expect(prompt).toContain("Pages and navigation:");
    expect(prompt).toContain("- Use routes.");
    expect(prompt).toContain("- Do not use Tabs.");
    expect(prompt).toContain("How to deliver:");
    expect(prompt).toContain("setta__set_app_definition");
    expect(prompt).toContain("Catalog: setta.app.default");
    expect(prompt).toContain("Available sections");
    expect(prompt).toContain("- Foo (section-1)");
    expect(prompt).toContain("View modes (treat tabs as pages):");
  });

  it("falls back when navigation instructions are blank", () => {
    const prompt = buildAppGenerationPrompt({
      catalogSummary: "Catalog: setta.app.default (version v1)",
      sectionsSummary: "",
      viewModesSummary: "",
      navigationInstructions: "   ",
      appSpecStreamingEnabled: true,
    });

    expect(prompt).toContain("Pages and navigation:\n(none)");
    expect(prompt).toContain("setta__stream_app_definition");
  });
});
