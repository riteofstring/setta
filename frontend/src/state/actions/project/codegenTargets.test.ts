import { useAllProjectMetadata, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectCodegenPluginTarget,
  createProjectConfig,
  createSingletonSections,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { applyProjectCodegenTargetsResponse } from "./codegenTargets";

describe("applyProjectCodegenTargetsResponse", () => {
  beforeEach(() => {
    resetProjectStores();
    useAllProjectMetadata.setState({
      defaultProjectConfigId: "project-alpha",
      projectMetadata: [
        createProjectConfig({
          id: "project-alpha",
          name: "Alpha",
          codegenTargets: [],
        }),
        createProjectConfig({
          id: "project-beta",
          name: "Beta",
          codegenTargets: [],
        }),
      ],
    });
    useProjectState.setState({
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectConfig: createProjectConfig({
        id: "project-alpha",
        name: "Alpha",
        codegenTargets: [],
      }),
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    });
  });

  it("updates the current project and matching metadata from the authoritative response", () => {
    const responseState: ProjectStateSingleConfig = {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectConfig: createProjectConfig({
        id: "project-alpha",
        name: "Alpha",
        codegenTargets: [
          createProjectCodegenPluginTarget({
            language: "setta-fixture-backend-codegen:typescript",
            options: {
              className: "AlphaState",
            },
          }),
        ],
      }),
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    };

    applyProjectCodegenTargetsResponse(responseState);

    expect(useProjectState.getState().projectConfig.codegenTargets).toEqual(
      responseState.projectConfig.codegenTargets,
    );
    expect(
      useAllProjectMetadata.getState().projectMetadata[0].codegenTargets,
    ).toEqual(responseState.projectConfig.codegenTargets);
    expect(
      useAllProjectMetadata.getState().projectMetadata[1].codegenTargets,
    ).toEqual([]);
  });

  it("leaves the loaded project state untouched when the response is for another project", () => {
    const responseState: ProjectStateSingleConfig = {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectConfig: createProjectConfig({
        id: "project-beta",
        name: "Beta",
        codegenTargets: [
          createProjectCodegenPluginTarget({
            language: "setta-fixture-backend-codegen:go",
          }),
        ],
      }),
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    };

    applyProjectCodegenTargetsResponse(responseState);

    expect(useProjectState.getState().projectConfig.codegenTargets).toEqual([]);
    expect(
      useAllProjectMetadata.getState().projectMetadata[1].codegenTargets,
    ).toEqual(responseState.projectConfig.codegenTargets);
  });
});
