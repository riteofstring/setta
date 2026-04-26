import { pasteSections, prepareSectionsForCopy } from "openapi/http";
import {
  useActiveSectionUI,
  useMisc,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ClipboardDataTypeEnum,
  type SectionsClipboardData,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy, paste } from "./copyPaste";
import { addTemporaryNotification } from "./notifications";
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    prepareSectionsForCopy: vi.fn(),
    pasteSections: vi.fn(),
  };
});
vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));
const mockedRoutePrepareSectionsForCopy = vi.mocked(prepareSectionsForCopy);
const mockedRoutePasteSections = vi.mocked(pasteSections);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);
let clipboardWriteTextMock = vi.fn();
let clipboardReadTextMock = vi.fn();
let originalNavigatorDescriptor: PropertyDescriptor | undefined;
let originalWindowDescriptor: PropertyDescriptor | undefined;
const sectionsClipboardPayload: SectionsClipboardData = {
  type: ClipboardDataTypeEnum.Sections,
  data: {
    core: {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
    },
    sectionVariantMap: {},
  },
};

function createOpenAPISuccess<T>(data: T) {
  return {
    data,
    request: new Request("http://setta.test"),
    response: { status: 200 } as Response,
  };
}

describe("copyPaste actions", () => {
  beforeEach(() => {
    resetProjectStores();
    mockedRoutePrepareSectionsForCopy.mockReset();
    mockedRoutePasteSections.mockReset();
    mockedAddTemporaryNotification.mockReset();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-alpha";
    });
    useMisc.setState({
      lastPaneClickLocation: { x: 240, y: 180 },
    });
    useShareSession.setState({ isDeploymentMode: false });
    useActiveSectionUI.setState({ activeIds: [] });
    clipboardWriteTextMock = vi.fn(async () => undefined);
    clipboardReadTextMock = vi.fn(async () =>
      JSON.stringify(sectionsClipboardPayload),
    );
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    );
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: (...args: Array<unknown>) =>
            clipboardWriteTextMock(...args),
          readText: (...args: Array<unknown>) => clipboardReadTextMock(...args),
        },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        getSelection: () =>
          ({
            toString: () => "",
          }) as Selection,
      },
    });
  });
  afterEach(() => {
    resetProjectStores();
    if (originalNavigatorDescriptor) {
      Object.defineProperty(
        globalThis,
        "navigator",
        originalNavigatorDescriptor,
      );
    } else {
      delete (
        globalThis as {
          navigator?: unknown;
        }
      ).navigator;
    }
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      delete (
        globalThis as {
          window?: unknown;
        }
      ).window;
    }
    vi.restoreAllMocks();
  });
  it("copies active sections through the canonical Go clipboard route", async () => {
    // Copy should request the canonical clipboard payload and write it to the browser clipboard.
    useActiveSectionUI.setState({ activeIds: ["section-a", "section-b"] });
    mockedRoutePrepareSectionsForCopy.mockResolvedValue(
      createOpenAPISuccess(sectionsClipboardPayload) as unknown as Awaited<
        ReturnType<typeof prepareSectionsForCopy>
      >,
    );
    await copy();
    expect(mockedRoutePrepareSectionsForCopy).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        sectionIds: ["section-a", "section-b"],
      },
    });
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      JSON.stringify(sectionsClipboardPayload),
    );
    expect(mockedAddTemporaryNotification).toHaveBeenNthCalledWith(
      1,
      "Copying...",
    );
    expect(mockedAddTemporaryNotification).toHaveBeenNthCalledWith(
      2,
      "Copied to clipboard",
    );
  });
  it("pastes section clipboard payloads through the canonical Go route", async () => {
    // Paste should preserve the current pane click location when no sections are active.
    mockedRoutePasteSections.mockResolvedValue(
      createOpenAPISuccess(null) as Awaited<ReturnType<typeof pasteSections>>,
    );
    await paste({ asRef: true });
    expect(clipboardReadTextMock).toHaveBeenCalledTimes(1);
    expect(mockedRoutePasteSections).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        data: sectionsClipboardPayload.data,
        position: { x: 240, y: 180 },
        asRef: true,
      },
    });
  });
  it("blocks paste in deployment mode before touching clipboard state", async () => {
    // Deployment mode should no-op instead of attempting clipboard or backend writes.
    useShareSession.setState({ isDeploymentMode: true });
    await paste({ asRef: false });
    expect(clipboardReadTextMock).not.toHaveBeenCalled();
    expect(mockedRoutePasteSections).not.toHaveBeenCalled();
  });
});
