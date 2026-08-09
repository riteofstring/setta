import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspaceDocument,
  deriveWorkspaceParentLookup,
  getAdjacentWorkspaceSectionId,
  getWorkspaceNavigationOrder,
  getWorkspaceSectionOrder,
  isValidWorkspaceColor,
  isWorkspaceSectionDescendant,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  validateWorkspaceDocument,
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  WORKSPACE_MAX_ZOOM,
  WORKSPACE_MIN_ZOOM,
  WorkspaceDocumentValidationError,
  type WorkspaceDocument,
  type WorkspaceJsonValue,
  type WorkspaceSection,
} from "../src/core.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

type SectionOptions = {
  children?: readonly string[];
  data?: WorkspaceJsonValue;
  orientation?: "horizontal" | "vertical";
  overflow?: "grow" | "scroll";
  title?: string;
};

function childLayoutFor(
  children: readonly string[] | undefined,
  orientation: "horizontal" | "vertical",
  overflow: "grow" | "scroll",
): WorkspaceSection["childLayout"] {
  if (!children) {
    return null;
  }
  return { orientation, overflow, positioning: "ordered", sectionIds: children };
}

function sectionSizeFor(
  orientation: "horizontal" | "vertical",
  overflow: "grow" | "scroll",
): WorkspaceSection["size"] {
  const fixedAxis = overflow === "scroll" ? orientation : null;
  return {
    height: { mode: fixedAxis === "vertical" ? "fixed" : "content", value: 180 },
    width: { mode: fixedAxis === "horizontal" ? "fixed" : "content", value: 240 },
  };
}

function section(id: string, options: SectionOptions = {}): WorkspaceSection {
  const orientation = options.orientation ?? "vertical";
  const overflow = options.overflow ?? "grow";
  return {
    childLayout: childLayoutFor(options.children, orientation, overflow),
    data: options.data ?? null,
    id,
    isMinimized: false,
    kind: "test",
    positionAndSizeLocked: false,
    presentation: {
      accentColor: null,
      chrome: "default",
      tagColor: null,
    },
    size: sectionSizeFor(orientation, overflow),
    title: options.title ?? id,
  };
}

function recursiveDocument(): WorkspaceDocument {
  return {
    rootSections: [
      { position: { x: -120.5, y: 40 }, sectionId: "root" },
      { position: { x: 600, y: -80 }, sectionId: "peer" },
    ],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {
      child: section("child", {
        children: ["grandchild"],
        orientation: "horizontal",
        overflow: "scroll",
      }),
      grandchild: section("grandchild", {
        data: { enabled: true, labels: ["one", "two"] },
      }),
      peer: section("peer"),
      root: section("root", { children: ["child"] }),
    },
    viewport: { x: 25, y: -10, zoom: 1.5 },
  };
}

function freeformDocument(): WorkspaceDocument {
  const document = recursiveDocument();
  const root = document.sections.root as WorkspaceSection;
  return {
    ...document,
    sections: {
      ...document.sections,
      root: {
        ...root,
        childLayout: {
          overflow: "grow",
          positioning: "freeform",
          positions: { child: { x: 48.5, y: 32 } },
          sectionIds: ["child"],
        },
      },
    },
  };
}

function expectValidationError(
  value: unknown,
  code: WorkspaceDocumentValidationError["code"],
  path: string,
): void {
  let thrown: unknown;
  try {
    validateWorkspaceDocument(value);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WorkspaceDocumentValidationError);
  expect(thrown).toMatchObject({ code, path });
}

describe("workspace document", () => {
  it("creates a serializable empty document with an explicit viewport", () => {
    type NoteData = Readonly<{ body: string }>;
    const document: WorkspaceDocument<NoteData> = createEmptyWorkspaceDocument<NoteData>();

    expect(JSON.parse(JSON.stringify(document))).toEqual({
      rootSections: [],
      schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
      sections: {},
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  it("round trips an arbitrarily deep mixed-orientation document", () => {
    const sections: Record<string, WorkspaceSection> = {};
    const depth = 2_048;
    for (let index = 0; index < depth; index += 1) {
      const id = `section-${index}`;
      const childId = index + 1 < depth ? `section-${index + 1}` : undefined;
      const options: SectionOptions = {
        orientation: index % 2 === 0 ? "vertical" : "horizontal",
      };
      if (childId) {
        options.children = [childId];
      }
      sections[id] = section(id, options);
    }
    const document: WorkspaceDocument = {
      rootSections: [{ position: { x: 12, y: -8 }, sectionId: "section-0" }],
      schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
      sections,
      viewport: { x: 4, y: 9, zoom: 0.5 },
    };

    const restored = parseWorkspaceDocument(serializeWorkspaceDocument(document));

    expect(restored).toEqual(document);
    expect(getWorkspaceSectionOrder(restored)).toHaveLength(depth);
    expect(getWorkspaceSectionOrder(restored).at(-1)).toBe(`section-${depth - 1}`);
  });

  it("round trips explicit nested freeform positions without changing traversal order", () => {
    const document = freeformDocument();

    const restored = parseWorkspaceDocument(serializeWorkspaceDocument(document));

    expect(restored).toEqual(document);
    expect(getWorkspaceSectionOrder(restored)).toEqual(["root", "child", "grandchild", "peer"]);
    expect(restored.sections.root?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: { child: { x: 48.5, y: 32 } },
      sectionIds: ["child"],
    });
  });

  it("derives parents and deterministic pre-order without serializing parallel parents", () => {
    const document = recursiveDocument();
    const parents = deriveWorkspaceParentLookup(document);

    expect([...parents]).toEqual([
      ["root", null],
      ["peer", null],
      ["grandchild", "child"],
      ["child", "root"],
    ]);
    expect(getWorkspaceSectionOrder(document)).toEqual(["root", "child", "grandchild", "peer"]);
    expect(getWorkspaceNavigationOrder(document)).toEqual(["peer", "root", "child", "grandchild"]);
    expect(getAdjacentWorkspaceSectionId(document, "peer", "next")).toBe("root");
    expect(getAdjacentWorkspaceSectionId(document, "root", "previous")).toBe("peer");
    expect(getAdjacentWorkspaceSectionId(document, "grandchild", "next")).toBeNull();
    expect(() =>
      getAdjacentWorkspaceSectionId(document, "root", "sideways" as unknown as "next" | "previous"),
    ).toThrow("navigation direction must be next or previous");
    expect(() => getAdjacentWorkspaceSectionId(document, "missing", "next")).toThrowError(
      expect.objectContaining({ code: "unknown-section" }),
    );
    expect(isWorkspaceSectionDescendant(parents, "grandchild", "root")).toBe(true);
    expect(isWorkspaceSectionDescendant(parents, "root", "grandchild")).toBe(false);
    expect(() =>
      isWorkspaceSectionDescendant(
        new Map([
          ["alpha", "beta"],
          ["beta", "alpha"],
        ]),
        "alpha",
        "missing",
      ),
    ).toThrow("parent lookup must be acyclic");
    expect(JSON.stringify(document)).not.toContain("parentId");
  });

  it("creates a deterministic top-level testing document", () => {
    const document = createWorkspaceTestDocument([
      { id: "alpha", title: "Alpha" },
      { id: "beta", title: "Beta" },
    ]);

    expect(document.rootSections).toEqual([
      { position: { x: 0, y: 0 }, sectionId: "alpha" },
      { position: { x: 280, y: 0 }, sectionId: "beta" },
    ]);
    expect(document.sections.beta?.title).toBe("Beta");
    expect(() => validateWorkspaceDocument(document)).not.toThrow();
  });
});

describe("workspace document validation", () => {
  it("fails specifically for invalid JSON and schema versions", () => {
    expect(() => parseWorkspaceDocument("{")).toThrowError(
      expect.objectContaining({ code: "invalid-json", path: "$" }),
    );
    expectValidationError(
      { ...recursiveDocument(), schemaVersion: 1 },
      "unsupported-schema-version",
      "$.schemaVersion",
    );
  });

  it("requires the schema-v2 positioning discriminator without a legacy fallback", () => {
    const candidate = structuredClone(recursiveDocument()) as unknown as {
      sections: Record<string, { childLayout: Record<string, unknown> | null }>;
    };
    const layout = candidate.sections.root?.childLayout;
    if (!layout) {
      throw new Error("Expected the root layout fixture.");
    }
    delete layout.positioning;

    expectValidationError(candidate, "invalid-value", '$.sections["root"].childLayout.positioning');
  });

  it.each([
    ["missing child", {}, '$.sections["root"].childLayout.positions["child"]', "invalid-section"],
    [
      "unknown child",
      { child: { x: 0, y: 0 }, extra: { x: 1, y: 1 } },
      '$.sections["root"].childLayout.positions["extra"]',
      "invalid-section",
    ],
    [
      "negative coordinate",
      { child: { x: -1, y: 0 } },
      '$.sections["root"].childLayout.positions["child"].x',
      "invalid-value",
    ],
    [
      "non-finite coordinate",
      { child: { x: 0, y: Number.NaN } },
      '$.sections["root"].childLayout.positions["child"].y',
      "invalid-value",
    ],
  ] as const)("rejects a freeform position map with a %s", (_label, positions, path, code) => {
    const document = freeformDocument();
    const root = document.sections.root as WorkspaceSection;
    const childLayout = root.childLayout;
    if (!childLayout || childLayout.positioning !== "freeform") {
      throw new Error("Expected the freeform root fixture.");
    }
    const candidate = {
      ...document,
      sections: {
        ...document.sections,
        root: { ...root, childLayout: { ...childLayout, positions } },
      },
    };

    expectValidationError(candidate, code, path);
  });

  it("rejects freeform-only extra fields and accessor-backed position entries without evaluation", () => {
    const extraField = structuredClone(freeformDocument()) as unknown as {
      sections: Record<string, { childLayout: Record<string, unknown> }>;
    };
    const layout = extraField.sections.root?.childLayout;
    if (!layout) {
      throw new Error("Expected the freeform root fixture.");
    }
    layout.orientation = "vertical";
    expectValidationError(
      extraField,
      "invalid-value",
      '$.sections["root"].childLayout.orientation',
    );

    let evaluated = false;
    const accessorDocument = structuredClone(freeformDocument()) as unknown as {
      sections: Record<string, { childLayout: { positions: Record<string, unknown> } }>;
    };
    const positions = accessorDocument.sections.root?.childLayout.positions;
    if (!positions) {
      throw new Error("Expected the freeform position map fixture.");
    }
    Object.defineProperty(positions, "child", {
      enumerable: true,
      get() {
        evaluated = true;
        return { x: 0, y: 0 };
      },
    });
    expectValidationError(
      accessorDocument,
      "invalid-value",
      '$.sections["root"].childLayout.positions',
    );
    expect(evaluated).toBe(false);
  });

  it("enforces the supported viewport zoom bounds", () => {
    for (const zoom of [WORKSPACE_MIN_ZOOM, WORKSPACE_MAX_ZOOM]) {
      expect(() =>
        validateWorkspaceDocument({ ...recursiveDocument(), viewport: { x: 0, y: 0, zoom } }),
      ).not.toThrow();
    }
    for (const zoom of [WORKSPACE_MIN_ZOOM / 2, WORKSPACE_MAX_ZOOM * 2, Number.NaN]) {
      expectValidationError(
        { ...recursiveDocument(), viewport: { x: 0, y: 0, zoom } },
        "invalid-value",
        "$.viewport.zoom",
      );
    }
  });

  it("rejects duplicate, unknown, unreachable, and cyclic placements", () => {
    const duplicate = recursiveDocument();
    expectValidationError(
      { ...duplicate, rootSections: [...duplicate.rootSections, duplicate.rootSections[0]] },
      "duplicate-placement",
      "$.rootSections[2].sectionId",
    );

    const unknown = recursiveDocument();
    expectValidationError(
      {
        ...unknown,
        sections: {
          ...unknown.sections,
          root: {
            ...unknown.sections.root,
            childLayout: {
              orientation: "vertical",
              overflow: "grow",
              positioning: "ordered",
              sectionIds: ["missing"],
            },
          },
        },
      },
      "unknown-section",
      '$.sections["root"].childLayout.sectionIds[0]',
    );

    const unreachable = recursiveDocument();
    expectValidationError(
      { ...unreachable, rootSections: unreachable.rootSections.slice(0, 1) },
      "unreachable-section",
      '$.sections["peer"]',
    );

    const cycle: WorkspaceDocument = {
      rootSections: [],
      schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
      sections: {
        alpha: section("alpha", { children: ["beta"] }),
        beta: section("beta", { children: ["alpha"] }),
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    expectValidationError(cycle, "cycle", '$.sections["alpha"].childLayout');
  });

  it.each([
    ["orientation", "diagonal", '$.sections["root"].childLayout.orientation'],
    ["overflow", "clip", '$.sections["root"].childLayout.overflow'],
    ["size mode", "auto", '$.sections["root"].size.width.mode'],
    ["chrome", "frameless", '$.sections["root"].presentation.chrome'],
  ])("rejects an unsupported %s", (_label, invalidValue, path) => {
    const candidate = structuredClone(recursiveDocument()) as unknown as {
      sections: Record<string, Record<string, unknown>>;
    };
    const root = candidate.sections.root;
    if (path.endsWith("orientation")) {
      (root?.childLayout as Record<string, unknown>).orientation = invalidValue;
    } else if (path.endsWith("overflow")) {
      (root?.childLayout as Record<string, unknown>).overflow = invalidValue;
    } else if (path.endsWith("mode")) {
      ((root?.size as Record<string, unknown>).width as Record<string, unknown>).mode =
        invalidValue;
    } else {
      (root?.presentation as Record<string, unknown>).chrome = invalidValue;
    }
    expectValidationError(candidate, "invalid-value", path);
  });

  it("rejects invalid colors, blank titles, non-finite positions, and invalid dimensions", () => {
    const invalidColor = structuredClone(recursiveDocument()) as unknown as {
      sections: Record<string, { presentation: { accentColor: unknown } }>;
    };
    if (invalidColor.sections.root) {
      invalidColor.sections.root.presentation.accentColor = "not-a-color";
    }
    expectValidationError(
      invalidColor,
      "invalid-color",
      '$.sections["root"].presentation.accentColor',
    );

    const blankTitle = structuredClone(recursiveDocument()) as unknown as {
      sections: Record<string, { title: unknown }>;
    };
    if (blankTitle.sections.root) {
      blankTitle.sections.root.title = "   ";
    }
    expectValidationError(blankTitle, "invalid-value", '$.sections["root"].title');

    const invalidPosition = structuredClone(recursiveDocument()) as unknown as {
      rootSections: { position: { x: unknown } }[];
    };
    if (invalidPosition.rootSections[0]) {
      invalidPosition.rootSections[0].position.x = Number.NaN;
    }
    expectValidationError(invalidPosition, "invalid-value", "$.rootSections[0].position.x");

    const invalidDimension = structuredClone(recursiveDocument()) as unknown as {
      sections: Record<string, { size: { height: { value: unknown } } }>;
    };
    if (invalidDimension.sections.root) {
      invalidDimension.sections.root.size.height.value = 0;
    }
    expectValidationError(
      invalidDimension,
      "invalid-value",
      '$.sections["root"].size.height.value',
    );
  });

  it("requires fixed main-axis sizing for scroll overflow", () => {
    const candidate = recursiveDocument();
    const child = candidate.sections.child;
    const invalid = {
      ...candidate,
      sections: {
        ...candidate.sections,
        child: child
          ? { ...child, size: { ...child.size, width: { mode: "content", value: 240 } } }
          : child,
      },
    };

    expectValidationError(invalid, "invalid-section", '$.sections["child"].size');
  });

  it("requires both dimensions to be fixed for freeform scroll overflow", () => {
    const document = freeformDocument();
    const root = document.sections.root as WorkspaceSection;
    const childLayout = root.childLayout;
    if (!childLayout || childLayout.positioning !== "freeform") {
      throw new Error("Expected the freeform root fixture.");
    }
    const invalid = {
      ...document,
      sections: {
        ...document.sections,
        root: {
          ...root,
          childLayout: { ...childLayout, overflow: "scroll" as const },
          size: {
            height: { mode: "fixed" as const, value: 400 },
            width: { mode: "content" as const, value: 500 },
          },
        },
      },
    };

    expectValidationError(invalid, "invalid-section", '$.sections["root"].size.width');
  });

  it("rejects non-JSON payload data without imposing a containment depth limit", () => {
    const cyclicData: { self?: unknown } = {};
    cyclicData.self = cyclicData;
    const candidate = recursiveDocument();
    const root = candidate.sections.root;
    const invalid = {
      ...candidate,
      sections: { ...candidate.sections, root: root ? { ...root, data: cyclicData } : root },
    };

    expectValidationError(invalid, "invalid-value", '$.sections["root"].data["self"]');
  });

  it("rejects sparse structural and payload arrays before serialization", () => {
    const candidate = recursiveDocument();
    const sparseRoots = [...candidate.rootSections];
    delete sparseRoots[0];
    expectValidationError(
      { ...candidate, rootSections: sparseRoots },
      "invalid-value",
      "$.rootSections",
    );

    const sparseData: WorkspaceJsonValue[] = ["one", "two"];
    delete sparseData[0];
    const root = candidate.sections.root;
    expectValidationError(
      {
        ...candidate,
        sections: {
          ...candidate.sections,
          root: root ? { ...root, data: sparseData } : root,
        },
      },
      "invalid-value",
      '$.sections["root"].data',
    );
  });

  it("rejects section maps whose own keys would not survive deterministic serialization", () => {
    for (const invalidKey of ["hidden", Symbol("section")]) {
      const candidate = recursiveDocument();
      const sections = { ...candidate.sections } as Record<PropertyKey, unknown>;
      Object.defineProperty(sections, invalidKey, {
        enumerable: typeof invalidKey === "symbol",
        value: section(String(invalidKey)),
      });

      expectValidationError({ ...candidate, sections }, "invalid-value", "$.sections");
    }
  });

  it("rejects accessor-backed fields without evaluating them", () => {
    const candidate = recursiveDocument();
    const viewport = { y: 0, zoom: 1 } as Record<string, unknown>;
    Object.defineProperty(viewport, "x", {
      enumerable: true,
      get: () => {
        throw new Error("The viewport getter must not run.");
      },
    });
    expectValidationError({ ...candidate, viewport }, "invalid-value", "$.viewport");

    const accessorData = ["value"] as WorkspaceJsonValue[];
    Object.defineProperty(accessorData, "0", {
      enumerable: true,
      get: () => {
        throw new Error("The payload getter must not run.");
      },
    });
    const root = candidate.sections.root;
    expectValidationError(
      {
        ...candidate,
        sections: {
          ...candidate.sections,
          root: root ? { ...root, data: accessorData } : root,
        },
      },
      "invalid-value",
      '$.sections["root"].data',
    );
  });

  it.each([
    "#abc",
    "#112233cc",
    "rebeccapurple",
    "rgb(20 30 40 / 50%)",
    "hsl(120deg 50% 40%)",
    "oklch(62% 0.18 240)",
    "color(display-p3 0.2 0.4 0.6)",
  ])("accepts the supported CSS color %s", (color) => {
    expect(isValidWorkspaceColor(color)).toBe(true);
  });

  it.each(["", " #fff", "var(--accent)", "rgb(red green blue)", "not-a-color"])(
    "rejects the unsupported CSS color %s",
    (color) => {
      expect(isValidWorkspaceColor(color)).toBe(false);
    },
  );
  it("returns false for a non-string runtime color candidate", () => {
    expect(isValidWorkspaceColor(null as unknown as string)).toBe(false);
  });
});
