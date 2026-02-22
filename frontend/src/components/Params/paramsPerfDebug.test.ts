import { afterEach, describe, expect, it } from "vitest";
import {
  installParamsPerfDebugHelper,
  readParamsPerfDebugMetrics,
} from "./paramsPerfDebug";

type FakeElement = {
  getBoundingClientRect: () => {
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
};

type FakeDocument = {
  querySelectorAll: (selector: string) => FakeElement[];
};

type PerfWindow = Window & {
  __settaReadParamsPerfDebugMetrics?: () => unknown;
  __settaLastParamsPerfDebugMetrics?: unknown;
};

function createFakeElement(rect: {
  top: number;
  left: number;
  width: number;
  height: number;
}): FakeElement {
  return {
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
  };
}

function createFakeDocument({
  sections,
  rows,
}: {
  sections: FakeElement[];
  rows: FakeElement[];
}): FakeDocument {
  return {
    querySelectorAll: (selector: string) => {
      if (selector === ".react-flow__node") {
        return sections;
      }
      if (selector === "[data-param-row='true']") {
        return rows;
      }
      return [];
    },
  };
}

function installFakeDom({
  width,
  height,
  doc,
}: {
  width: number;
  height: number;
  doc: FakeDocument;
}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: width,
      innerHeight: height,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: doc,
  });
}

describe("paramsPerfDebug", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it("counts total and viewport-visible sections and param rows", () => {
    const sectionVisible = createFakeElement({
      top: 10,
      left: 10,
      width: 100,
      height: 100,
    });
    const sectionHidden = createFakeElement({
      top: -220,
      left: 10,
      width: 100,
      height: 100,
    });
    const rowVisibleA = createFakeElement({
      top: 20,
      left: 20,
      width: 80,
      height: 20,
    });
    const rowVisibleB = createFakeElement({
      top: 48,
      left: 20,
      width: 80,
      height: 20,
    });
    const rowHidden = createFakeElement({
      top: 1400,
      left: 20,
      width: 80,
      height: 20,
    });

    const fakeDoc = createFakeDocument({
      sections: [sectionVisible, sectionHidden],
      rows: [rowVisibleA, rowVisibleB, rowHidden],
    });
    installFakeDom({ width: 1000, height: 800, doc: fakeDoc });

    const metrics = readParamsPerfDebugMetrics(fakeDoc as unknown as Document);

    expect(metrics.totalSectionCount).toBe(2);
    expect(metrics.visibleSectionCount).toBe(1);
    expect(metrics.totalParamRowCount).toBe(3);
    expect(metrics.visibleParamRowCount).toBe(2);
  });

  it("registers a dev-only window reader for repeated perf sampling", () => {
    const fakeDoc = createFakeDocument({
      sections: [
        createFakeElement({ top: 16, left: 16, width: 120, height: 80 }),
      ],
      rows: [createFakeElement({ top: 24, left: 22, width: 90, height: 24 })],
    });
    installFakeDom({ width: 1200, height: 900, doc: fakeDoc });

    installParamsPerfDebugHelper();
    const perfWindow = window as PerfWindow;

    if (import.meta.env.DEV) {
      expect(typeof perfWindow.__settaReadParamsPerfDebugMetrics).toBe(
        "function",
      );
      expect(perfWindow.__settaLastParamsPerfDebugMetrics).toBeTruthy();
    } else {
      expect(perfWindow.__settaReadParamsPerfDebugMetrics).toBeUndefined();
      expect(perfWindow.__settaLastParamsPerfDebugMetrics).toBeUndefined();
    }
  });
});
