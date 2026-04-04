import { useAllProjectMetadata, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectChatWindowingState,
  createProjectCodegenPluginTarget,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  createSingletonSections,
  type CodeFileBinding,
  type SingleConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";
import { applyProjectCodegenTargetsResponse } from "./codegenTargets";

const genCodeBindingFixture: CodeFileBinding = {
  canonical_path: "code/sections/alpha/setta_gen.py",
  access_mode: "read_only",
  autoBinding: false,
};

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
        codegenTargets: [createProjectCodegenPythonTarget()],
        entryCodeBlockId: "gen-python-section",
      }),
      singletonSections: createSingletonSections({
        GenPythonCode: "gen-python-section",
      }),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
      genCodeBinding: genCodeBindingFixture,
    });
  });

  it("replaces the current project state and matching metadata from the authoritative response", () => {
    const responseState: SingleConfig = {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectChatWindowing: createProjectChatWindowingState(),
      projectConfig: createProjectConfig({
        id: "project-alpha",
        name: "Alpha",
        codegenTargets: [],
        entryCodeBlockId: null,
      }),
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    };

    applyProjectCodegenTargetsResponse(responseState);

    expect(useProjectState.getState().projectConfig).toEqual(
      responseState.projectConfig,
    );
    expect(useProjectState.getState().singletonSections).toEqual(
      responseState.singletonSections,
    );
    expect(useProjectState.getState().genCodeBinding).toBeNull();
    expect(useAllProjectMetadata.getState().projectMetadata[0]).toEqual(
      responseState.projectConfig,
    );
  });

  it("leaves the loaded project state untouched when the response is for another project", () => {
    const responseState: SingleConfig = {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectChatWindowing: createProjectChatWindowingState(),
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

    expect(useProjectState.getState().projectConfig.id).toBe("project-alpha");
    expect(useProjectState.getState().projectConfig.entryCodeBlockId).toBe(
      "gen-python-section",
    );
    expect(useProjectState.getState().singletonSections.GenPythonCode).toBe(
      "gen-python-section",
    );
    expect(useProjectState.getState().genCodeBinding).toEqual(
      genCodeBindingFixture,
    );
    expect(useAllProjectMetadata.getState().projectMetadata[1]).toEqual(
      responseState.projectConfig,
    );
  });
});
