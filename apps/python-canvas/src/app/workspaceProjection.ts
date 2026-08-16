import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSectionData,
  type WorkspaceDocumentInput,
} from "@setta/workspace";

import type {
  CallableV1,
  ProjectSnapshotV1,
  ProviderStatusV1,
} from "../backend/generatedContract";
import type { CallableSectionData } from "../sections/CallableSection";

export const CALLABLE_SECTION_KIND = "python-canvas.callable" as const;
export const CALLABLE_SECTION_ID = "python-canvas:callable" as const;
export const GENERATED_PYTHON_SECTION_ID =
  "python-canvas:generated-python" as const;

export const CALLABLE_SECTION_SIZE = { width: 360, height: 280 } as const;
export const GENERATED_PYTHON_SECTION_SIZE = {
  width: 640,
  height: 420,
} as const;

export function projectWorkspaceDocument(
  snapshot: ProjectSnapshotV1,
): WorkspaceDocumentInput {
  const [callable] = snapshot.callables;

  return {
    sections: {
      [CALLABLE_SECTION_ID]: {
        id: CALLABLE_SECTION_ID,
        kind: CALLABLE_SECTION_KIND,
        name: callable.name,
        size: CALLABLE_SECTION_SIZE,
        overflowMode: false,
        isMinimized: false,
        positionAndSizeLocked: true,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
        data: projectCallableSectionData(callable, snapshot.providerStatus),
      },
      [GENERATED_PYTHON_SECTION_ID]: {
        id: GENERATED_PYTHON_SECTION_ID,
        kind: WORKSPACE_CODE_SECTION_KIND,
        name: "Generated Python",
        size: GENERATED_PYTHON_SECTION_SIZE,
        overflowMode: false,
        isMinimized: false,
        positionAndSizeLocked: true,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
        data: createWorkspaceCodeSectionData({
          code: snapshot.generatedCode.code,
          language: "python",
          wrapLines: true,
          lineNumbers: true,
          indentWidth: 4,
          readOnly: true,
        }),
      },
    },
    topLevelSections: {
      [CALLABLE_SECTION_ID]: {
        x: 0,
        y: 0,
        w: CALLABLE_SECTION_SIZE.width,
        h: CALLABLE_SECTION_SIZE.height,
        zIndex: 0,
      },
      [GENERATED_PYTHON_SECTION_ID]: {
        x: 400,
        y: 0,
        w: GENERATED_PYTHON_SECTION_SIZE.width,
        h: GENERATED_PYTHON_SECTION_SIZE.height,
        zIndex: 1,
      },
    },
    viewport: null,
    activeIds: [],
  };
}

function projectCallableSectionData(
  callable: CallableV1,
  providerStatus: ProviderStatusV1,
): CallableSectionData {
  return {
    callable: {
      authoredExpression: callable.authoredExpression,
      id: callable.id,
      name: callable.name,
    },
    providerStatus: {
      provider: providerStatus.provider,
      status: providerStatus.status,
      state: providerStatus.state,
    },
  };
}
