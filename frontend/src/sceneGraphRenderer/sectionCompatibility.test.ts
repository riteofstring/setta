import type { Node } from "forks/xyflow/core/types";
import {
  createCallableSectionImpl,
  createChatSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultChatSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  computeSceneGraphSectionCompatibilitySnapshot,
  isSceneGraphSectionTypeSceneCompatible,
} from "./sectionCompatibility";

function createNode(
  overrides: Partial<Node> & Pick<Node, "id" | "position">,
): Node {
  const hasWidth = Object.prototype.hasOwnProperty.call(overrides, "width");
  const hasHeight = Object.prototype.hasOwnProperty.call(overrides, "height");
  return {
    id: overrides.id,
    position: overrides.position,
    width: hasWidth ? overrides.width : 140,
    height: hasHeight ? overrides.height : 100,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? overrides.zIndex ?? 0,
    type: overrides.type,
    style: overrides.style,
  };
}

describe("scene graph section compatibility", () => {
  it("keeps an explicit section-type matrix for scene-vs-dom render mode", () => {
    // Phase 5 requires deterministic coverage by section type with no heuristics.
    expect(
      isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.Callable),
    ).toBe(true);
    expect(
      isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.TextBlock),
    ).toBe(true);
    expect(isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.Chart)).toBe(
      true,
    );
    expect(
      isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.Spreadsheet),
    ).toBe(true);
    expect(
      isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.TaskBoard),
    ).toBe(true);
    expect(isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.Chat)).toBe(
      false,
    );
    expect(isSceneGraphSectionTypeSceneCompatible(SectionTypeEnum.Plugin)).toBe(
      false,
    );
  });

  it("forces dom islands for unsupported or unresolved section implementations", () => {
    // Unsupported section types and unresolved variant/impl links must stay DOM-mounted.
    const nodesById = new Map<string, Node>([
      ["section-a", createNode({ id: "section-a", position: { x: 0, y: 0 } })],
      [
        "section-b",
        createNode({ id: "section-b", position: { x: 200, y: 0 } }),
      ],
      [
        "section-c",
        createNode({ id: "section-c", position: { x: 400, y: 0 } }),
      ],
      [
        "section-d",
        createNode({ id: "section-d", position: { x: 600, y: 0 } }),
      ],
    ]);

    const snapshot = computeSceneGraphSectionCompatibilitySnapshot({
      nodesById,
      sectionVariantMap: {
        "section-a": "variant-a",
        "section-b": "variant-b",
        "section-c": "variant-c",
      },
      sectionVariants: {
        "variant-a": createVariant({
          id: "variant-a",
          impl: "impl-callable",
          nonPresetImpls: ["impl-callable"],
        }),
        "variant-b": createVariant({
          id: "variant-b",
          impl: "impl-chat",
          nonPresetImpls: ["impl-chat"],
        }),
        "variant-c": createVariant({
          id: "variant-c",
          impl: "missing-impl",
          nonPresetImpls: ["missing-impl"],
        }),
      },
      sectionImpls: {
        "impl-callable": createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: "impl-callable",
          },
        ),
        "impl-chat": createChatSectionImpl(createUserDefaultChatSectionImpl(), {
          id: "impl-chat",
        }),
      },
    });

    expect(snapshot.sceneCompatibleSectionCount).toBe(1);
    expect(snapshot.domOnlySectionCount).toBe(1);
    expect(snapshot.unresolvedSectionCount).toBe(2);
    expect(Array.from(snapshot.forcedDomSectionIds).sort()).toEqual([
      "section-b",
      "section-c",
      "section-d",
    ]);
  });
});
