/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { getWorkspaceDocument } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "../document/types";
import { HeaderIcon } from "../section/header/HeaderIcon";
import { SectionHeader } from "../section/header/SectionHeader";
import { setWorkspaceTextSectionData } from "./textSectionActions";
import {
  createWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_KIND,
} from "./textSectionData";
import { createWorkspaceTextSection } from "./textSectionKind";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The registration half of the built-in Text section: a host composes the helper's definition
// with its own kinds, narrows what the registration accepts, decides whether the header carries
// the display-mode control, and can leave the built-in out entirely.

const SECTION_ID = "notes";

function makeDocument(
  section: Partial<WorkspaceSectionInput> = {},
): WorkspaceDocumentInput {
  return {
    sections: {
      [SECTION_ID]: {
        id: SECTION_ID,
        kind: WORKSPACE_TEXT_SECTION_KIND,
        name: "Notes",
        data: createWorkspaceTextSectionData(),
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        ...section,
      },
    },
    topLevelSections: {
      [SECTION_ID]: { x: 0, y: 0, w: 500, h: null, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  };
}

function resetWorkspaceStores() {
  registerSectionKinds(testWorkspace.host, {});
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.appearance.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
}

describe("built-in text section registration", () => {
  afterEach(() => {
    resetWorkspaceStores();
  });

  it("rejects a registration with no allowed format or display mode", () => {
    expect(() => createWorkspaceTextSection({ formats: [] })).toThrow(
      /must allow at least one format/u,
    );
    expect(() => createWorkspaceTextSection({ displayModes: [] })).toThrow(
      /must allow at least one display mode/u,
    );
  });

  it("rejects a registration naming an unknown format or display mode", () => {
    expect(() =>
      createWorkspaceTextSection({
        formats: ["markdown", "rst" as unknown as "markdown"],
      }),
    ).toThrow(/unknown format rst/u);
    expect(() =>
      createWorkspaceTextSection({
        displayModes: ["preview" as unknown as "edit"],
      }),
    ).toThrow(/unknown display mode preview/u);
  });

  it("loads an omitted size at the reference's text block default", () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection(),
    });
    loadWorkspaceDocument(testWorkspace.host, makeDocument({ size: undefined }));
    expect(getWorkspaceDocument(testWorkspace.host).sections[SECTION_ID]?.size).toEqual({
      width: 500,
      height: 150,
    });
  });

  it("takes a host-supplied default size", () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
        defaultSize: { width: 320, height: 200 },
      }),
    });
    loadWorkspaceDocument(testWorkspace.host, makeDocument({ size: undefined }));
    expect(getWorkspaceDocument(testWorkspace.host).sections[SECTION_ID]?.size).toEqual({
      width: 320,
      height: 200,
    });
  });

  it("fails the load on malformed text section data", () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection(),
    });
    expect(() =>
      loadWorkspaceDocument(testWorkspace.host, makeDocument({ data: { text: "notes" } })),
    ).toThrow(/Text section notes is missing its string format field/u);
  });

  it("fails the load on a format the registration does not allow", () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
        formats: ["markdown"],
      }),
    });
    expect(() =>
      loadWorkspaceDocument(testWorkspace.host,
        makeDocument({
          data: createWorkspaceTextSectionData({ format: "plaintext" }),
        }),
      ),
    ).toThrow(/does not allow/u);
  });

  it("refuses a typed write outside the registration's display modes", () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
        displayModes: ["edit"],
      }),
    });
    loadWorkspaceDocument(testWorkspace.host, makeDocument());
    expect(() =>
      setWorkspaceTextSectionData(testWorkspace.host,
        SECTION_ID,
        createWorkspaceTextSectionData({ displayMode: "render" }),
      ),
    ).toThrow(/does not allow/u);
  });

  it("fails a document naming the kind when the host leaves the built-in out", () => {
    registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
    expect(() => loadWorkspaceDocument(testWorkspace.host, makeDocument())).toThrow(
      /Section kind setta\.text is not registered/u,
    );
  });
});

describe("built-in text section header", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetWorkspaceStores();
  });

  async function renderHeader() {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(SectionHeader, {
          sectionId: SECTION_ID,
          hasSectionStyleTheme: false,
        })
        }</WorkspaceTestProvider>,
      );
    });
  }

  async function renderIcon() {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(HeaderIcon, {
          hasSectionStyleTheme: false,
          sectionId: SECTION_ID,
          sectionKind: WORKSPACE_TEXT_SECTION_KIND,
        })
        }</WorkspaceTestProvider>,
      );
    });
    return host.querySelector("svg path")?.getAttribute("d") ?? null;
  }

  it("paints the section's own format, like the reference's text block header icon", async () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection(),
    });
    loadWorkspaceDocument(testWorkspace.host, makeDocument());
    const plaintextPath = await renderIcon();
    expect(plaintextPath).not.toBeNull();
    await act(async () => {
      setWorkspaceTextSectionData(testWorkspace.host,
        SECTION_ID,
        createWorkspaceTextSectionData({ format: "markdown" }),
      );
    });
    expect(await renderIcon()).not.toBe(plaintextPath);
  });

  it("leaves the display-mode control out when the host asks it to", async () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
        showDisplayModeControl: false,
      }),
    });
    loadWorkspaceDocument(testWorkspace.host, makeDocument());
    await renderHeader();
    expect(host.querySelector("button[aria-label='Render text']")).toBeNull();
  });

  it("leaves the display-mode control out when one mode is forced", async () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
        displayModes: ["render"],
      }),
    });
    loadWorkspaceDocument(testWorkspace.host,
      makeDocument({
        data: createWorkspaceTextSectionData({ displayMode: "render" }),
      }),
    );
    await renderHeader();
    expect(host.querySelector("button[aria-label='Edit text']")).toBeNull();
  });

  it("contributes the control ahead of the container controls by default", async () => {
    registerSectionKinds(testWorkspace.host, {
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection(),
    });
    loadWorkspaceDocument(testWorkspace.host, makeDocument());
    await renderHeader();
    const labels = [...host.querySelectorAll("button[aria-label]")].map(
      (button) => button.getAttribute("aria-label"),
    );
    expect(labels[0]).toBe("Render text");
    expect(labels).toContain("Lock position and size");
  });
});
