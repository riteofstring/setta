/* @vitest-environment jsdom */

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
import type { WorkspaceDocumentInput, WorkspaceSectionInput } from "../document/types";
import { HeaderIcon } from "../section/header/HeaderIcon";
import { SectionHeader } from "../section/header/SectionHeader";
import { setWorkspaceTextSectionData } from "./textSectionActions";
import { createWorkspaceTextSectionData, WORKSPACE_TEXT_SECTION_KIND } from "./textSectionData";
import { createWorkspaceTextSection } from "./textSectionKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The registration half of the built-in Text section: a host composes the helper's definition
// with its own kinds, narrows what the registration accepts, decides whether the header carries
// the display-mode control, and can leave the built-in out entirely.

const SECTION_ID = "notes";

function makeDocument(section: Partial<WorkspaceSectionInput> = {}): WorkspaceDocumentInput {
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
    topLevelSections: { [SECTION_ID]: { x: 0, y: 0, w: 500, h: null, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  };
}

function resetWorkspaceStores() {
  registerSectionKinds({});
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useWorkspaceAppearance.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
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
      createWorkspaceTextSection({ formats: ["markdown", "rst" as unknown as "markdown"] }),
    ).toThrow(/unknown format rst/u);
    expect(() =>
      createWorkspaceTextSection({ displayModes: ["preview" as unknown as "edit"] }),
    ).toThrow(/unknown display mode preview/u);
  });

  it("loads an omitted size at the reference's text block default", () => {
    registerSectionKinds({ [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection() });
    loadWorkspaceDocument(makeDocument({ size: undefined }));
    expect(getWorkspaceDocument().sections[SECTION_ID]?.size).toEqual({
      width: 500,
      height: 150,
    });
  });

  it("takes a host-supplied default size", () => {
    registerSectionKinds({
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
        defaultSize: { width: 320, height: 200 },
      }),
    });
    loadWorkspaceDocument(makeDocument({ size: undefined }));
    expect(getWorkspaceDocument().sections[SECTION_ID]?.size).toEqual({
      width: 320,
      height: 200,
    });
  });

  it("fails the load on malformed text section data", () => {
    registerSectionKinds({ [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection() });
    expect(() => loadWorkspaceDocument(makeDocument({ data: { text: "notes" } }))).toThrow(
      /Text section notes is missing its string format field/u,
    );
  });

  it("fails the load on a format the registration does not allow", () => {
    registerSectionKinds({
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({ formats: ["markdown"] }),
    });
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({ data: createWorkspaceTextSectionData({ format: "plaintext" }) }),
      ),
    ).toThrow(/does not allow/u);
  });

  it("refuses a typed write outside the registration's display modes", () => {
    registerSectionKinds({
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({ displayModes: ["edit"] }),
    });
    loadWorkspaceDocument(makeDocument());
    expect(() =>
      setWorkspaceTextSectionData(
        SECTION_ID,
        createWorkspaceTextSectionData({ displayMode: "render" }),
      ),
    ).toThrow(/does not allow/u);
  });

  it("fails a document naming the kind when the host leaves the built-in out", () => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
    expect(() => loadWorkspaceDocument(makeDocument())).toThrow(
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
        createElement(SectionHeader, { sectionId: SECTION_ID, hasSectionStyleTheme: false }),
      );
    });
  }

  async function renderIcon() {
    await act(async () => {
      root.render(
        createElement(HeaderIcon, {
          hasSectionStyleTheme: false,
          sectionId: SECTION_ID,
          sectionKind: WORKSPACE_TEXT_SECTION_KIND,
        }),
      );
    });
    return host.querySelector("svg path")?.getAttribute("d") ?? null;
  }

  it("paints the section's own format, like the reference's text block header icon", async () => {
    registerSectionKinds({ [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection() });
    loadWorkspaceDocument(makeDocument());
    const plaintextPath = await renderIcon();
    expect(plaintextPath).not.toBeNull();
    await act(async () => {
      setWorkspaceTextSectionData(
        SECTION_ID,
        createWorkspaceTextSectionData({ format: "markdown" }),
      );
    });
    expect(await renderIcon()).not.toBe(plaintextPath);
  });

  it("leaves the display-mode control out when the host asks it to", async () => {
    registerSectionKinds({
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({ showDisplayModeControl: false }),
    });
    loadWorkspaceDocument(makeDocument());
    await renderHeader();
    expect(host.querySelector("button[aria-label='Render text']")).toBeNull();
  });

  it("leaves the display-mode control out when one mode is forced", async () => {
    registerSectionKinds({
      [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({ displayModes: ["render"] }),
    });
    loadWorkspaceDocument(
      makeDocument({ data: createWorkspaceTextSectionData({ displayMode: "render" }) }),
    );
    await renderHeader();
    expect(host.querySelector("button[aria-label='Edit text']")).toBeNull();
  });

  it("contributes the control ahead of the container controls by default", async () => {
    registerSectionKinds({ [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection() });
    loadWorkspaceDocument(makeDocument());
    await renderHeader();
    const labels = [...host.querySelectorAll("button[aria-label]")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels[0]).toBe("Render text");
    expect(labels).toContain("Lock position and size");
  });
});
