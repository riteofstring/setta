import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import {
  planWorkspaceOutlineKeyboardAction,
  resolveWorkspaceOutlineRows,
  WorkspaceOutline,
} from "../src/internal/workspace-outline.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function outlineDocument(): WorkspaceDocument {
  const base = createWorkspaceTestDocument([
    { id: "root", title: "Root workspace" },
    { id: "first", title: "First child" },
    { id: "nested", title: "Nested group" },
    { id: "deep", title: "Deep child" },
    { id: "other", title: "Other root" },
  ]);
  const section = (sectionId: string) => base.sections[sectionId] as WorkspaceSection;
  return {
    ...base,
    rootSections: [
      { position: { x: 0, y: 0 }, sectionId: "root" },
      { position: { x: 480, y: 0 }, sectionId: "other" },
    ],
    sections: {
      ...base.sections,
      nested: {
        ...section("nested"),
        childLayout: {
          orientation: "horizontal",
          overflow: "scroll",
          positioning: "ordered",
          sectionIds: ["deep"],
        },
      },
      root: {
        ...section("root"),
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          positioning: "ordered",
          sectionIds: ["first", "nested"],
        },
      },
    },
  };
}

describe("workspace outline", () => {
  it("flattens only expanded branches with complete tree position metadata", () => {
    const rows = resolveWorkspaceOutlineRows(outlineDocument(), ["root", "nested"]);

    expect(rows).toEqual([
      {
        expanded: true,
        hasChildren: true,
        level: 1,
        parentSectionId: null,
        positionInSet: 1,
        sectionId: "root",
        setSize: 2,
        title: "Root workspace",
      },
      {
        expanded: false,
        hasChildren: false,
        level: 2,
        parentSectionId: "root",
        positionInSet: 1,
        sectionId: "first",
        setSize: 2,
        title: "First child",
      },
      {
        expanded: true,
        hasChildren: true,
        level: 2,
        parentSectionId: "root",
        positionInSet: 2,
        sectionId: "nested",
        setSize: 2,
        title: "Nested group",
      },
      {
        expanded: false,
        hasChildren: false,
        level: 3,
        parentSectionId: "nested",
        positionInSet: 1,
        sectionId: "deep",
        setSize: 1,
        title: "Deep child",
      },
      {
        expanded: false,
        hasChildren: false,
        level: 1,
        parentSectionId: null,
        positionInSet: 2,
        sectionId: "other",
        setSize: 2,
        title: "Other root",
      },
    ]);
    expect(resolveWorkspaceOutlineRows(outlineDocument(), [])).toHaveLength(2);
  });

  it("plans roving, disclosure, activation, and direction-aware hierarchy keys", () => {
    const collapsed = resolveWorkspaceOutlineRows(outlineDocument(), ["root"]);
    const expanded = resolveWorkspaceOutlineRows(outlineDocument(), ["root", "nested"]);

    expect(planWorkspaceOutlineKeyboardAction(collapsed, "root", "ArrowRight", "ltr")).toEqual({
      sectionId: "first",
      type: "focus",
    });
    expect(planWorkspaceOutlineKeyboardAction(collapsed, "nested", "ArrowRight", "ltr")).toEqual({
      sectionId: "nested",
      type: "expand",
    });
    expect(planWorkspaceOutlineKeyboardAction(collapsed, "nested", "ArrowLeft", "rtl")).toEqual({
      sectionId: "nested",
      type: "expand",
    });
    expect(planWorkspaceOutlineKeyboardAction(expanded, "deep", "ArrowLeft", "ltr")).toEqual({
      sectionId: "nested",
      type: "focus",
    });
    expect(planWorkspaceOutlineKeyboardAction(expanded, "deep", "Home", "ltr")).toEqual({
      sectionId: "root",
      type: "focus",
    });
    expect(planWorkspaceOutlineKeyboardAction(expanded, "root", "End", "ltr")).toEqual({
      sectionId: "other",
      type: "focus",
    });
    expect(planWorkspaceOutlineKeyboardAction(expanded, "deep", "Enter", "ltr")).toEqual({
      type: "activate",
    });
  });

  it("renders an accessible multiselect tree from the public controller snapshot", () => {
    const host = new WorkspaceInMemoryHost(outlineDocument());
    host.controller.selectSections(["first", "other"]);

    const markup = renderToStaticMarkup(<WorkspaceOutline controller={host.controller} />);

    expect(markup).toContain('<nav aria-label="Workspace outline"');
    expect(markup).toContain("Outline");
    expect(markup).toContain("5 sections");
    expect(markup).toContain('data-workspace-outline-announcement=""');
    expect(markup).toMatch(/<ul[^>]+aria-multiselectable="true"[^>]+role="tree"/u);
    expect(markup).toMatch(
      /aria-expanded="true"[^>]+aria-level="1"[^>]+aria-posinset="1"[^>]+aria-selected="false"[^>]+aria-setsize="2"[^>]+data-workspace-outline-section-id="root"/u,
    );
    expect(markup).toMatch(
      /aria-level="2"[^>]+aria-posinset="1"[^>]+aria-selected="true"[^>]+aria-setsize="2"[^>]+data-workspace-outline-section-id="first"[^>]+tabindex="0"/u,
    );
    expect(markup).toContain("Nested group");
    expect(markup).not.toContain("Deep child");
  });

  it("supports explicit initial expansion and rejects malformed public labels and IDs", () => {
    const host = new WorkspaceInMemoryHost(outlineDocument());
    const markup = renderToStaticMarkup(
      <WorkspaceOutline
        ariaLabel="Document sections"
        controller={host.controller}
        defaultExpandedSectionIds={["root", "nested"]}
        heading="Sections"
      />,
    );

    expect(markup).toContain('aria-label="Document sections"');
    expect(markup).toContain("Deep child");
    expect(() =>
      renderToStaticMarkup(<WorkspaceOutline ariaLabel=" " controller={host.controller} />),
    ).toThrow("Workspace outline ariaLabel must be a non-empty string");
    expect(() =>
      renderToStaticMarkup(
        <WorkspaceOutline controller={host.controller} defaultExpandedSectionIds={["missing"]} />,
      ),
    ).toThrow('Workspace outline expanded section ID "missing" is unknown');
    expect(() =>
      renderToStaticMarkup(
        <WorkspaceOutline
          controller={host.controller}
          defaultExpandedSectionIds={["root", "root"]}
        />,
      ),
    ).toThrow('Workspace outline expanded section ID "root" is duplicated');
  });
});
