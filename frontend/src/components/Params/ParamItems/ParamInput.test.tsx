/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CapturedParamUIProps = {
  onChange: (value: unknown, options?: { skipBackendUpdate?: boolean }) => void;
  onDropzoneStateless?: (
    attachments: Array<
      | {
          kind: "text";
          name: string;
          text: string;
        }
      | {
          binaryPayload: ArrayBuffer;
          byteLength: number;
          contentId: string;
          kind: "file";
          mimeType: string;
          name: string;
          size: number;
        }
    >,
  ) => void;
  onRevealPassword?: () => void;
};

const mocks = vi.hoisted(() => ({
  callOpenAPIMock: vi.fn(async (request: { route: string }) => {
    if (request.route === "getPasswordParamValue") {
      return {
        data: {
          value: "revealed-secret",
        },
        hasResponse: true,
        status: 200,
      };
    }
    return {
      data: null,
      hasResponse: true,
      status: 200,
    };
  }),
  currentLocalValue: null as string | null,
  dispatchOptimisticProjectStateUpdateMock: vi.fn(
    ({
      apply,
      send,
    }: {
      apply?: (state: object) => void;
      send?: (frontendOpId: string) => Promise<unknown>;
    }) => {
      apply?.({});
      return send?.("frontend-op-1");
    },
  ),
  getPasswordParamValueMock: vi.fn((args: object) => ({
    args,
    route: "getPasswordParamValue",
  })),
  lastParamUIProps: null as CapturedParamUIProps | null,
  pendingValues: [] as string[],
  previewParamState: {
    baseValue: "",
    codeObjType: "TextParam",
    codeObjVariantId: "variant-1",
    sectionVariantId: "section-variant-1",
  } as {
    baseValue: string;
    codeObjType: string;
    codeObjVariantId: string | null;
    sectionVariantId: string | null;
  } | null,
  previewStore: {
    byProjectConfigId: {} as Record<string, unknown>,
  },
  projectState: {
    projectConfig: {
      id: "project-config-1",
    },
  },
  sendRealtimeDependencyEventMock: vi.fn(),
  sendRealtimeSectionParamLiteralMock: vi.fn(),
  setCodeObjVariantImplValueMock: vi.fn(),
  setParamEnteredValueMock: vi.fn((args: object) => ({
    args,
    route: "setParamEnteredValue",
  })),
  shouldEmitRealtimeValueMock: vi.fn(() => false),
  useProjectStateSetStateMock: vi.fn((updater: (state: object) => void) => {
    updater(mocks.projectState);
  }),
}));

vi.mock("openapi/http", () => ({
  getPasswordParamValue: mocks.getPasswordParamValueMock,
  setParamEnteredValue: mocks.setParamEnteredValueMock,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: mocks.callOpenAPIMock,
  };
});

vi.mock("state/actions/sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate:
    mocks.dispatchOptimisticProjectStateUpdateMock,
  getCurrCodeObjVariantIfPresent: () => {
    if (!mocks.previewParamState?.codeObjVariantId) {
      return null;
    }
    return {
      id: mocks.previewParamState.codeObjVariantId,
    };
  },
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent: () => {
    if (!mocks.previewParamState) {
      return null;
    }
    return {
      type: mocks.previewParamState.codeObjType,
      value: mocks.previewParamState.baseValue,
    };
  },
  getCurrProjectConfigId: () => "project-config-1",
  getCurrSectionVariantId: () => mocks.previewParamState?.sectionVariantId,
  setCodeObjVariantImplValue: mocks.setCodeObjVariantImplValueMock,
}));

vi.mock("state/actions/websocketReceive", () => ({
  sendRealtimeDependencyEvent: mocks.sendRealtimeDependencyEventMock,
  sendRealtimeSectionParamLiteral: mocks.sendRealtimeSectionParamLiteralMock,
}));

vi.mock("state/definitions", () => ({
  useProjectState: Object.assign(
    (selector: (state: object) => unknown) => selector(mocks.projectState),
    {
      setState: mocks.useProjectStateSetStateMock,
    },
  ),
  useToolArgumentPreview: (selector: (state: object) => unknown) =>
    selector(mocks.previewStore),
}));

vi.mock("state/hooks/utils", () => ({
  useLocalPendingValue: (globalValue: string) => [
    mocks.currentLocalValue ?? globalValue,
    (nextValue: string) => {
      mocks.currentLocalValue = nextValue;
      mocks.pendingValues.push(nextValue);
    },
  ],
}));

vi.mock("utils/paramValue", () => ({
  shouldEmitRealtimeValue: mocks.shouldEmitRealtimeValueMock,
}));

vi.mock("../ParamUIs/ParamUI", () => ({
  ParamUI: (props: CapturedParamUIProps) => {
    mocks.lastParamUIProps = props;
    return <div data-testid="param-ui" />;
  },
}));

import { ParamInput } from "./ParamInput";

type RenderedParamInput = {
  host: HTMLDivElement;
  root: Root;
};

async function renderParamInput(
  props: Partial<ComponentProps<typeof ParamInput>> = {},
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <ParamInput sectionId="section-1" paramInfoId="param-1" {...props} />,
    );
  });

  return { host, root } satisfies RenderedParamInput;
}

async function cleanupRenderedParamInput(rendered: RenderedParamInput) {
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

function requireParamUIProps() {
  if (!mocks.lastParamUIProps) {
    throw new Error("Expected ParamUI props to be captured.");
  }
  return mocks.lastParamUIProps;
}

describe("ParamInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.callOpenAPIMock.mockClear();
    mocks.currentLocalValue = null;
    mocks.dispatchOptimisticProjectStateUpdateMock.mockClear();
    mocks.getPasswordParamValueMock.mockClear();
    mocks.lastParamUIProps = null;
    mocks.pendingValues = [];
    mocks.previewParamState = {
      baseValue: "",
      codeObjType: CodeObjTypeEnum.TextParam,
      codeObjVariantId: "variant-1",
      sectionVariantId: "section-variant-1",
    };
    mocks.previewStore = {
      byProjectConfigId: {},
    };
    mocks.sendRealtimeDependencyEventMock.mockClear();
    mocks.sendRealtimeSectionParamLiteralMock.mockClear();
    mocks.setCodeObjVariantImplValueMock.mockClear();
    mocks.setParamEnteredValueMock.mockClear();
    mocks.shouldEmitRealtimeValueMock.mockReset();
    mocks.shouldEmitRealtimeValueMock.mockReturnValue(false);
    mocks.useProjectStateSetStateMock.mockClear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("routes text param updates through the optimistic entered-value path", async () => {
    const rendered = await renderParamInput();

    try {
      await act(async () => {
        requireParamUIProps().onChange("next value");
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.pendingValues).toEqual(["next value"]);
      expect(
        mocks.dispatchOptimisticProjectStateUpdateMock,
      ).toHaveBeenCalledTimes(1);
      expect(mocks.setCodeObjVariantImplValueMock).toHaveBeenCalledWith(
        {},
        "param-1",
        "variant-1",
        {
          value: "next value",
        },
      );
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: "frontend-op-1",
          paramInfoId: "param-1",
          projectConfigId: "project-config-1",
          sectionId: "section-1",
          sectionVariantId: "section-variant-1",
          value: "next value",
        },
      });
    } finally {
      await cleanupRenderedParamInput(rendered);
    }
  });

  it("routes password updates through the password branch without optimistic code-variant writes", async () => {
    mocks.previewParamState = {
      baseValue: "",
      codeObjType: CodeObjTypeEnum.PasswordParam,
      codeObjVariantId: "variant-password",
      sectionVariantId: "section-variant-1",
    };

    const rendered = await renderParamInput();

    try {
      await act(async () => {
        requireParamUIProps().onChange("secret");
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(
        mocks.dispatchOptimisticProjectStateUpdateMock,
      ).not.toHaveBeenCalled();
      expect(mocks.setCodeObjVariantImplValueMock).not.toHaveBeenCalled();
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          paramInfoId: "param-1",
          projectConfigId: "project-config-1",
          sectionId: "section-1",
          sectionVariantId: "section-variant-1",
          value: "secret",
        },
      });
    } finally {
      await cleanupRenderedParamInput(rendered);
    }
  });

  it("publishes stateless attachment metadata once and file bytes separately", async () => {
    const binaryPayload = new Uint8Array([1, 2, 3]).buffer;
    const rendered = await renderParamInput();

    try {
      await act(async () => {
        requireParamUIProps().onDropzoneStateless?.([
          {
            kind: "text",
            name: "notes.txt",
            text: "hello",
          },
          {
            binaryPayload,
            byteLength: 3,
            contentId: "content-1",
            kind: "file",
            mimeType: "image/png",
            name: "photo.png",
            size: 3,
          },
        ]);
      });

      expect(mocks.sendRealtimeDependencyEventMock).toHaveBeenCalledTimes(2);
      expect(mocks.sendRealtimeDependencyEventMock).toHaveBeenNthCalledWith(1, {
        dependencyKey: {
          codeObjId: "param-1",
          sectionId: "section-1",
          type: DependencyKeyTypeEnum.SectionParam,
        },
        payload: {
          payload: expect.any(String),
          type: DependencyValueTypeEnum.Literal,
        },
      });
      const metadataEvent =
        mocks.sendRealtimeDependencyEventMock.mock.calls[0]?.[0];
      expect(JSON.parse(metadataEvent.payload.payload)).toEqual({
        attachments: [
          {
            kind: "text",
            name: "notes.txt",
            text: "hello",
          },
          {
            byteLength: 3,
            contentId: "content-1",
            kind: "file",
            mimeType: "image/png",
            name: "photo.png",
            size: 3,
          },
        ],
        paramInfoId: "param-1",
        sectionId: "section-1",
      });
      expect(mocks.sendRealtimeDependencyEventMock).toHaveBeenNthCalledWith(2, {
        binaryPayload,
        dependencyKey: {
          codeObjId: "param-1",
          sectionId: "section-1",
          type: DependencyKeyTypeEnum.SectionParam,
        },
        payload: {
          payload: {
            byteLength: 3,
            contentId: "content-1",
            mimeType: "image/png",
          },
          type: DependencyValueTypeEnum.Binary,
        },
      });
    } finally {
      await cleanupRenderedParamInput(rendered);
    }
  });

  it("loads a revealed password into the local pending value", async () => {
    mocks.previewParamState = {
      baseValue: "",
      codeObjType: CodeObjTypeEnum.PasswordParam,
      codeObjVariantId: "variant-password",
      sectionVariantId: "section-variant-1",
    };

    const rendered = await renderParamInput();

    try {
      await act(async () => {
        requireParamUIProps().onRevealPassword?.();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mocks.getPasswordParamValueMock).toHaveBeenCalledWith({
        body: {
          paramInfoId: "param-1",
          projectConfigId: "project-config-1",
          sectionId: "section-1",
        },
      });
      expect(mocks.pendingValues).toContain("revealed-secret");
    } finally {
      await cleanupRenderedParamInput(rendered);
    }
  });
});
