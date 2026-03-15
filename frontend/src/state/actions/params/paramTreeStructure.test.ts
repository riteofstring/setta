import { type ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultDictSectionImpl,
  createVariant,
  ParameterPassingStyleEnum,
  ParamNameTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  buildParamParentMap,
  buildParamTreeView,
  getParamRootId,
} from "./paramTreeStructure";

type ParamNodeSpec = {
  children?: string[];
  id: string;
  kind: "leaf" | "nested";
};

function createNestedParamImpl(implId: string, children: string[]) {
  return {
    type: CodeObjTypeEnum.NestedParam,
    id: implId,
    name: implId,
    description: "",
    isPreset: false,
    children,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: false,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    typeAnnotation: "",
  };
}

function createParamTreeState(): {
  rootId: string;
  sectionId: string;
  state: ZustandProjectState;
} {
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";
  const rootId = "root-param";
  const nodes: ParamNodeSpec[] = [
    {
      id: rootId,
      kind: "nested",
      children: ["group-a", "param-c"],
    },
    {
      id: "group-a",
      kind: "nested",
      children: ["param-a", "param-b", "param-hidden"],
    },
    { id: "param-a", kind: "leaf" },
    { id: "param-b", kind: "leaf" },
    { id: "param-c", kind: "leaf" },
    { id: "param-hidden", kind: "leaf" },
  ];
  const codeObjs: ZustandProjectState["codeObjs"] = {};
  const codeObjImpls: ZustandProjectState["codeObjImpls"] = {};
  const codeObjVariants: ZustandProjectState["codeObjVariants"] = {};
  const codeObjVariantMap: Record<string, string> = {};

  for (const node of nodes) {
    const variantId = `${node.id}-variant`;
    const implId = `${node.id}-impl`;
    codeObjVariantMap[node.id] = variantId;
    codeObjs[node.id] = createCore({
      id: node.id,
      name: node.id,
      variants: [variantId],
      defaultVariant: variantId,
      sharedModifier: {},
      unsharedKeys: [],
    });
    codeObjVariants[variantId] = createVariant({
      id: variantId,
      name: `${node.id} Variant`,
      impl: implId,
      nonPresetImpls: [],
    });
    codeObjImpls[implId] =
      node.kind === "nested"
        ? createNestedParamImpl(implId, [...(node.children ?? [])])
        : createCodeParamCodeObjImpl(createUserDefaultCodeParamCodeObjImpl(), {
            id: implId,
            name: node.id,
          });
  }

  return {
    rootId,
    sectionId,
    state: {
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: sectionVariantId },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          name: "Section",
          variants: [sectionVariantId],
          defaultVariant: sectionVariantId,
          sharedModifier: {},
          unsharedKeys: [],
        }),
      },
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl(
          createUserDefaultDictSectionImpl(),
          {
            id: sectionImplId,
            topLevelParamId: rootId,
            codeObjVariantMap,
            selectedParams: [],
            edgeInputParams: [],
          },
        ),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          name: "Section Variant",
          impl: sectionImplId,
          nonPresetImpls: [],
        }),
      },
      codeObjs,
      codeObjImpls,
      codeObjVariants,
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState,
  };
}

describe("paramTreeStructure", () => {
  it("derives the param root, parent map, and visible tree rows from section state", () => {
    // Param drag/drop relies on the state-backed hierarchy rather than rebuilding ad hoc maps in each caller.
    const { rootId, sectionId, state } = createParamTreeState();

    expect(getParamRootId(state, sectionId)).toBe(rootId);
    expect(buildParamParentMap(state, sectionId, rootId)).toEqual({
      [rootId]: null,
      "group-a": rootId,
      "param-a": "group-a",
      "param-b": "group-a",
      "param-c": rootId,
      "param-hidden": "group-a",
    });
    expect(
      buildParamTreeView(state, sectionId, ["group-a", "param-c"], {
        "group-a": ["group-a"],
        "param-a": ["group-a", "param-a"],
        "param-b": ["group-a", "param-b"],
        "param-c": ["param-c"],
      }),
    ).toEqual({
      rootId,
      parentById: {
        [rootId]: null,
        "group-a": rootId,
        "param-a": "group-a",
        "param-b": "group-a",
        "param-c": rootId,
        "param-hidden": "group-a",
      },
      flat: [
        {
          id: "group-a",
          parentId: rootId,
          depth: 0,
          isParent: true,
        },
        {
          id: "param-a",
          parentId: "group-a",
          depth: 1,
          isParent: false,
        },
        {
          id: "param-b",
          parentId: "group-a",
          depth: 1,
          isParent: false,
        },
        {
          id: "param-c",
          parentId: rootId,
          depth: 0,
          isParent: false,
        },
      ],
      visibleChildrenByParent: {
        [rootId]: ["group-a", "param-c"],
        "group-a": ["param-a", "param-b"],
      },
    });
  });
});
