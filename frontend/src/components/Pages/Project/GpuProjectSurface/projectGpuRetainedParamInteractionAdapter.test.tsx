/* @vitest-environment jsdom */

import type { GpuDomIsland } from "gpuFlow/scene";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdges";
import {
  createSharedChatEdgeFromConnection,
  isValidSharedChatEdgeConnection,
} from "state/actions/chatSharedEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import {
  createEdgeFromConnection,
  isValidDataEdgeConnection,
} from "state/actions/edges";
import {
  STATE_MACHINE_EDGE_HANDLE_IDS,
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
} from "state/actions/stateMachineEdges";
import {
  useMisc,
  useProjectSearch,
  useProjectState,
  useTypeErrors,
  type ZustandProjectState,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createNestedParamCodeObjImpl,
  createProjectConfig,
  createSingleConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paramInputProps: vi.fn(),
  paramNameInputProps: vi.fn(),
  subscribeToGpuViewportRepositionMock: vi.fn(),
  unsubscribeViewportRepositionMock: vi.fn(),
}));

vi.mock("components/Params/ParamItems/ParamInput", () => ({
  ParamInput: (props: {
    maybeErrorMessage?: string;
    paramInfoId: string;
    sectionId: string;
    tooltipParentDivId?: string | null;
  }) => {
    mocks.paramInputProps(props);
    return (
      <div
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
      />
    );
  },
}));

vi.mock("components/Params/ParamItems/ParamNameInput", () => ({
  ParamNameInput: (props: {
    bg: string;
    border: string;
    hasChildren: boolean;
    paramInfoId: string;
    sectionId: string;
    tooltipParentDivId?: string | null;
    validationBubbleContainerDivId?: string | null;
    validationBubbleCoordinateSpace?: string | null;
  }) => {
    mocks.paramNameInputProps(props);
    return (
      <div
        data-testid="param-name-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
      />
    );
  },
}));

vi.mock("gpuFlow/viewportReposition", () => ({
  subscribeToGpuViewportReposition: () => {
    mocks.subscribeToGpuViewportRepositionMock();
    return mocks.unsubscribeViewportRepositionMock;
  },
}));

import {
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
} from "./projectGpuPortalAdapter";
import {
  getProjectRetainedContentConnectionOptions,
  getProjectScenePortConnectionOptions,
  getProjectScenePortConnectionPolicy,
  renderProjectGpuDomIsland,
} from "./projectGpuRetainedParamInteractionAdapter";

type RenderedIsland = {
  host: HTMLDivElement;
  root: Root;
};

async function renderIsland(island: GpuDomIsland): Promise<RenderedIsland> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<>{renderProjectGpuDomIsland(island)}</>);
  });

  return { host, root };
}

async function cleanupRenderedIsland(rendered: RenderedIsland) {
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("project GPU retained param DOM islands", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.paramInputProps.mockClear();
    mocks.paramNameInputProps.mockClear();
    mocks.subscribeToGpuViewportRepositionMock.mockClear();
    mocks.unsubscribeViewportRepositionMock.mockClear();
    useTypeErrors.setState({ errors: {}, userRequested: false });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetProjectStores();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("mounts retained param inputs against the viewport CodeMirror tooltip portal", async () => {
    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
          sectionId: "section-1",
          tooltipParentDivId: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
        }),
      );
      expect(
        rendered.host
          .querySelector('[data-testid="param-input"]')
          ?.getAttribute("data-tooltip-parent"),
      ).toBe(PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID);
      expect(mocks.subscribeToGpuViewportRepositionMock).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }

    expect(mocks.unsubscribeViewportRepositionMock).toHaveBeenCalledTimes(1);
  });

  it("passes retained param type-error messages into active controls", async () => {
    useTypeErrors.setState({
      errors: {
        "section-1": {
          callable: [],
          params: {
            "param-1": ["Expected int.", "Received text."],
          },
        },
      },
      userRequested: false,
    });

    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          maybeErrorMessage: "Expected int.\nReceived text.",
          paramInfoId: "param-1",
          sectionId: "section-1",
        }),
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }
  });

  it("mounts retained param name inputs against the viewport CodeMirror tooltip portal", async () => {
    const rendered = await renderIsland(retainedParamNameIsland());

    try {
      expect(mocks.paramNameInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          bg: "",
          border: "",
          hasChildren: false,
          paramInfoId: "param-1",
          sectionId: "section-1",
          tooltipParentDivId: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
          validationBubbleContainerDivId:
            PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
          validationBubbleCoordinateSpace: "viewport",
        }),
      );
      expect(
        rendered.host
          .querySelector('[data-testid="param-name-input"]')
          ?.getAttribute("data-tooltip-parent"),
      ).toBe(PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID);
      expect(
        rendered.host.querySelector(
          '[data-gpu-project-param-name-dom-island="true"]',
        )?.id,
      ).toBe("param-label:section-1:param-1");
      expect(mocks.subscribeToGpuViewportRepositionMock).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }

    expect(mocks.unsubscribeViewportRepositionMock).toHaveBeenCalledTimes(1);
  });

  it("passes nested row presentation state into retained param name inputs", async () => {
    seedNestedParamNameProjectState();
    useTypeErrors.setState({
      errors: {
        "section-1": {
          callable: [],
          params: {
            "param-1": ["Expected int."],
          },
        },
      },
      userRequested: false,
    });
    useProjectSearch.setState({
      focused: {
        name: "Param",
        paramInfoId: "param-1",
        sectionId: "section-1",
      },
      lookup: new Set([createProjectSearchLookupKey("section-1", "param-1")]),
    });

    const rendered = await renderIsland(retainedParamNameIsland());

    try {
      expect(mocks.paramNameInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          bg: expect.stringContaining("!bg-blue-700"),
          border: "bg-red-200 dark:bg-red-800/30",
          hasChildren: true,
          paramInfoId: "param-1",
          sectionId: "section-1",
        }),
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }
  });
});

describe("project GPU retained param connection options", () => {
  afterEach(() => {
    useMisc.setState({ isSelectingParams: false });
  });

  it("provides Setta data-edge policy for scene-owned retained ports", () => {
    useMisc.setState({ isSelectingParams: false });
    const options = getProjectRetainedContentConnectionOptions({
      canEditStructure: true,
      zoomActivationKeyPressed: false,
    });
    const start = {
      handleId: "param-in",
      ownerSectionId: "section-1",
      surfaceId: "surface-1",
      type: "target" as const,
    };

    expect(options.onConnect).toBe(createEdgeFromConnection);
    expect(options.isValidConnection).toBe(isValidDataEdgeConnection);
    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: "other-output",
          sectionId: "section-2",
          type: "source",
        },
        start,
      ),
    ).toBe(true);
    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: "agentic-edge-source",
          sectionId: "section-2",
          type: "source",
        },
        start,
      ),
    ).toBe(false);
    expect(resolveDisabledOption(options.disabled)).toBe(false);

    useMisc.setState({ isSelectingParams: true });

    expect(resolveDisabledOption(options.disabled)).toBe(true);
  });
});

describe("project GPU scene port connection options", () => {
  afterEach(() => {
    useMisc.setState({ isSelectingParams: false });
  });

  it("routes section scene link starts through their project edge families", () => {
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: AGENTIC_EDGE_HANDLE_IDS.source,
      }),
    ).toEqual({
      isValidConnection: isValidAgenticEdgeConnection,
      onConnect: createAgenticEdgeFromConnection,
    });
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: SHARED_CHAT_EDGE_HANDLE_IDS.source,
      }),
    ).toEqual({
      isValidConnection: isValidSharedChatEdgeConnection,
      onConnect: createSharedChatEdgeFromConnection,
    });
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
      }),
    ).toEqual({
      isValidConnection: isValidStateMachineEdgeConnection,
      onConnect: createStateMachineEdgeFromConnection,
    });
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: "param-output",
      }),
    ).toEqual({
      isValidConnection: isValidDataEdgeConnection,
      onConnect: createEdgeFromConnection,
    });
  });

  it("keeps scene-owned link starts on family-compatible targets only", () => {
    const options = getProjectScenePortConnectionOptions({
      canEditStructure: true,
      zoomActivationKeyPressed: false,
    });
    const start = {
      handleId: AGENTIC_EDGE_HANDLE_IDS.source,
      ownerSectionId: "section-1",
      type: "source" as const,
    };

    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: SHARED_CHAT_EDGE_HANDLE_IDS.target,
          sectionId: "section-2",
          type: "target",
        },
        start,
      ),
    ).toBe(true);
    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          sectionId: "section-2",
          type: "target",
        },
        start,
      ),
    ).toBe(false);
    expect(resolveDisabledOption(options.disabled)).toBe(false);

    useMisc.setState({ isSelectingParams: true });

    expect(resolveDisabledOption(options.disabled)).toBe(true);
  });
});

function resolveDisabledOption(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function retainedParamIsland(): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 160, x: 0, y: 0 },
    id: "param-control:section-1:param-1",
    kind: "retained-content-control",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 160, x: 10, y: 20 },
    source: {
      hitRecordId: "control:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
  };
}

function retainedParamNameIsland(): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 120, x: 0, y: 0 },
    id: "param-label:section-1:param-1",
    kind: "retained-content-label",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 120, x: 10, y: 20 },
    source: {
      hitRecordId: "label:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
  };
}

function seedNestedParamNameProjectState() {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const childParamId = "param-child";
  const childVariantId = "param-child-variant";
  const childImplId = "param-child-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [childImplId]: createCodeParamCodeObjImpl({
          id: childImplId,
          name: childParamId,
        }),
        [paramImplId]: createNestedParamCodeObjImpl({
          children: [childParamId],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: paramImplId,
          isPreset: false,
          name: "param-1",
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [childVariantId]: createVariant({
          id: childVariantId,
          impl: childImplId,
          name: childVariantId,
          nonPresetImpls: [childImplId],
        }),
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        [childParamId]: createCore({
          defaultVariant: childVariantId,
          displayName: "",
          id: childParamId,
          name: childParamId,
          variants: [childVariantId],
        }),
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            [childParamId]: childVariantId,
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: ["param-1"],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}
