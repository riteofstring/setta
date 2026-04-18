import { describe, expect, it } from "vitest";

import {
  createProjectConfig,
  createProjectRunCapabilities,
  createSectionCapabilities,
  createSingleConfig,
  createSingletonSections,
} from "utils/generatedTypes";

import { resolveMainRunRequest, resolveRunRequest } from "./runCapabilities";

describe("resolveMainRunRequest", () => {
  it("prefers the local entry code block over stale backend run capabilities", () => {
    const state = createSingleConfig({
      projectConfig: createProjectConfig({
        entryCodeBlockId: "manual-section",
        hasPythonCodegenTarget: true,
        runCapabilities: createProjectRunCapabilities({
          canRunFromMain: true,
          effectiveEntrySectionId: "generated-section",
        }),
      }),
      sectionCapabilities: {
        "manual-section": createSectionCapabilities({
          canRun: true,
          runRequestSectionId: "manual-section",
          canSelectAsEntryCodeBlock: true,
          entryCodeBlockValue: "manual-section",
        }),
        "generated-section": createSectionCapabilities({
          canRun: true,
          canSelectAsEntryCodeBlock: true,
        }),
      },
      singletonSections: createSingletonSections({
        GenPythonCode: "generated-section",
      }),
    });

    expect(resolveMainRunRequest(state)).toEqual({
      canRun: true,
      disabledReason: null,
      executionSectionId: "manual-section",
      effectiveSectionId: "manual-section",
    });
  });

  it("uses the generated entry section id when the backend omits a runRequestSectionId", () => {
    const state = createSingleConfig({
      projectConfig: createProjectConfig({
        entryCodeBlockId: null,
        hasPythonCodegenTarget: true,
        runCapabilities: createProjectRunCapabilities({
          canRunFromMain: true,
          effectiveEntrySectionId: "generated-section",
        }),
      }),
      sectionCapabilities: {
        "generated-section": createSectionCapabilities({
          canRun: true,
          canSelectAsEntryCodeBlock: true,
        }),
      },
      singletonSections: createSingletonSections({
        GenPythonCode: "generated-section",
      }),
    });

    expect(resolveMainRunRequest(state)).toEqual({
      canRun: true,
      disabledReason: null,
      executionSectionId: "generated-section",
      effectiveSectionId: "generated-section",
    });
  });

  it("disables main run when the local entry selection is cleared", () => {
    const state = createSingleConfig({
      projectConfig: createProjectConfig({
        entryCodeBlockId: null,
        hasPythonCodegenTarget: false,
        runCapabilities: createProjectRunCapabilities({
          canRunFromMain: true,
          effectiveEntrySectionId: "removed-section",
        }),
      }),
      sectionCapabilities: {
        "removed-section": createSectionCapabilities({
          canRun: true,
          runRequestSectionId: "removed-section",
        }),
      },
    });

    expect(resolveMainRunRequest(state)).toEqual({
      canRun: false,
      disabledReason: "Select a manual entry code block to run.",
      executionSectionId: null,
      effectiveSectionId: null,
    });
  });
});

describe("resolveRunRequest", () => {
  it("uses the requested generated section id when that section is runnable", () => {
    const state = createSingleConfig({
      projectConfig: createProjectConfig({
        hasPythonCodegenTarget: true,
      }),
      sectionCapabilities: {
        "generated-section": createSectionCapabilities({
          canRun: true,
          canSelectAsEntryCodeBlock: true,
        }),
      },
      singletonSections: createSingletonSections({
        GenPythonCode: "generated-section",
      }),
    });

    expect(resolveRunRequest(state, "generated-section")).toEqual({
      canRun: true,
      disabledReason: null,
      executionSectionId: "generated-section",
      effectiveSectionId: "generated-section",
    });
  });
});
