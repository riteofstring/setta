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
import type {
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "../document/types";
import { HeaderIcon } from "../section/header/HeaderIcon";
import { setWorkspaceCodeSectionData } from "./codeSectionActions";
import {
  createWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_KIND,
} from "./codeSectionData";
import { createWorkspaceCodeSection } from "./codeSectionKind";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The registration half of the built-in Code Editor section: a host composes the helper's
// definition with its own kinds, narrows what the registration accepts, and can leave it out
// entirely. The data contract is validated where the document enters the package.

const SECTION_ID = "code";

function makeDocument(
  section: Partial<WorkspaceSectionInput> = {},
): WorkspaceDocumentInput {
  return {
    sections: {
      [SECTION_ID]: {
        id: SECTION_ID,
        kind: WORKSPACE_CODE_SECTION_KIND,
        name: "train.py",
        data: createWorkspaceCodeSectionData(),
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
  registerSectionKinds({});
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useWorkspaceAppearance.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
}

describe("built-in code section registration", () => {
  afterEach(() => {
    resetWorkspaceStores();
  });

  it("rejects a registration with no allowed language", () => {
    expect(() => createWorkspaceCodeSection({ languages: [] })).toThrow(
      /must allow at least one language/u,
    );
  });

  it("rejects a registration naming an unknown language", () => {
    expect(() =>
      createWorkspaceCodeSection({
        languages: ["python", "rust" as unknown as "python"],
      }),
    ).toThrow(/unknown language rust/u);
  });

  it("loads an omitted size at the reference's code section default", () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection(),
    });
    loadWorkspaceDocument(makeDocument({ size: undefined }));
    expect(getWorkspaceDocument().sections[SECTION_ID]?.size).toEqual({
      width: 500,
      height: "auto",
    });
  });

  it("takes a host-supplied default size", () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
        defaultSize: { width: 320, height: 200 },
      }),
    });
    loadWorkspaceDocument(makeDocument({ size: undefined }));
    expect(getWorkspaceDocument().sections[SECTION_ID]?.size).toEqual({
      width: 320,
      height: 200,
    });
  });

  it("fails the load on malformed code section data", () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection(),
    });
    expect(() =>
      loadWorkspaceDocument(makeDocument({ data: { code: "x = 1" } })),
    ).toThrow(/Code section code is missing its string language field/u);
  });

  it("fails the load on a language the registration does not allow", () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
        languages: ["python", "json"],
      }),
    });
    expect(() =>
      loadWorkspaceDocument(
        makeDocument({
          data: createWorkspaceCodeSectionData({ language: "bash" }),
        }),
      ),
    ).toThrow(/does not allow/u);
  });

  it("refuses a typed write outside the registration's languages", () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
        languages: ["python", "json"],
      }),
    });
    loadWorkspaceDocument(makeDocument());
    expect(() =>
      setWorkspaceCodeSectionData(
        SECTION_ID,
        createWorkspaceCodeSectionData({ language: "yaml" }),
      ),
    ).toThrow(/does not allow/u);
  });

  it("fails a document naming the kind when the host leaves the built-in out", () => {
    registerSectionKinds({ leaf: { renderContent: () => null } });
    expect(() => loadWorkspaceDocument(makeDocument())).toThrow(
      /Section kind setta\.code is not registered/u,
    );
  });
});

describe("built-in code section header icon", () => {
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

  async function renderIcon() {
    await act(async () => {
      root.render(
        createElement(HeaderIcon, {
          hasSectionStyleTheme: false,
          sectionId: SECTION_ID,
          sectionKind: WORKSPACE_CODE_SECTION_KIND,
        }),
      );
    });
    return host.querySelector("svg path")?.getAttribute("d") ?? null;
  }

  it("paints the section's own language, like the reference's code header icon", async () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection(),
    });
    loadWorkspaceDocument(makeDocument());
    const pythonPath = await renderIcon();
    expect(pythonPath).not.toBeNull();
    await act(async () => {
      setWorkspaceCodeSectionData(
        SECTION_ID,
        createWorkspaceCodeSectionData({ language: "bash" }),
      );
    });
    expect(await renderIcon()).not.toBe(pythonPath);
  });

  it("takes a host-supplied icon instead", async () => {
    registerSectionKinds({
      [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
        icon: ({ className }) =>
          createElement("i", { className, "data-host-icon": "true" }),
      }),
    });
    loadWorkspaceDocument(makeDocument());
    await act(async () => {
      root.render(
        createElement(HeaderIcon, {
          hasSectionStyleTheme: false,
          sectionId: SECTION_ID,
          sectionKind: WORKSPACE_CODE_SECTION_KIND,
        }),
      );
    });
    expect(host.querySelector("[data-host-icon]")).not.toBeNull();
  });
});
