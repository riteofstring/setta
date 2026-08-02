import type { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { patchWrappedFlagsForWidenReflow } from "./terminalSizing";

type FakeLine = {
  isWrapped?: boolean;
  _isWrapped?: boolean;
  getTrimmedLength: () => number;
  getCodePoint: (index: number) => number | null | undefined;
};

function createFakeLine({
  trimmedLength,
  codePoint = 65,
  isWrapped = false,
  usePrivateWrapFlag = false,
}: {
  trimmedLength: number;
  codePoint?: number;
  isWrapped?: boolean;
  usePrivateWrapFlag?: boolean;
}): FakeLine {
  const line: FakeLine = {
    getTrimmedLength: () => trimmedLength,
    getCodePoint: () => codePoint,
  };
  if (usePrivateWrapFlag) {
    line._isWrapped = isWrapped;
  } else {
    line.isWrapped = isWrapped;
  }
  return line;
}

function createFakeTerminal(lines: FakeLine[], cursorY: number): Terminal {
  const views = lines.map((line) => ({
    isWrapped: line.isWrapped ?? line._isWrapped ?? false,
    _line: line,
    translateToString: (trimRight = false) =>
      trimRight ? "x".repeat(line.getTrimmedLength()) : "",
  }));
  return {
    buffer: {
      active: {
        length: lines.length,
        baseY: 0,
        cursorY,
        getLine: (y: number) => views[y] ?? null,
      },
    },
    _core: {
      _bufferService: {
        buffer: {
          lines: {
            get: (y: number) => lines[y] ?? null,
          },
        },
      },
    },
  } as unknown as Terminal;
}

describe("patchWrappedFlagsForWidenReflow", () => {
  it("marks recent hard-wrapped continuation lines outside the cursor group", () => {
    const continuationLine = createFakeLine({
      trimmedLength: 8,
    });
    const terminal = createFakeTerminal(
      [
        createFakeLine({ trimmedLength: 80 }),
        continuationLine,
        createFakeLine({ trimmedLength: 5 }),
      ],
      2,
    );

    patchWrappedFlagsForWidenReflow(terminal, 80);

    expect(continuationLine.isWrapped).toBe(true);
  });

  it("skips candidates when the previous full line ends with whitespace", () => {
    const continuationLine = createFakeLine({
      trimmedLength: 8,
    });
    const terminal = createFakeTerminal(
      [
        createFakeLine({ trimmedLength: 80, codePoint: 32 }),
        continuationLine,
        createFakeLine({ trimmedLength: 5 }),
      ],
      2,
    );

    patchWrappedFlagsForWidenReflow(terminal, 80);

    expect(continuationLine.isWrapped).toBe(false);
  });

  it("falls back to the private wrapped flag when xterm omits the public one", () => {
    const continuationLine = createFakeLine({
      trimmedLength: 8,
      usePrivateWrapFlag: true,
    });
    const terminal = createFakeTerminal(
      [
        createFakeLine({ trimmedLength: 79 }),
        continuationLine,
        createFakeLine({ trimmedLength: 5 }),
      ],
      2,
    );

    patchWrappedFlagsForWidenReflow(terminal, 80);

    expect(continuationLine._isWrapped).toBe(true);
  });

  it("does not patch the line group containing the cursor", () => {
    const cursorLine = createFakeLine({
      trimmedLength: 8,
    });
    const terminal = createFakeTerminal(
      [createFakeLine({ trimmedLength: 80 }), cursorLine],
      1,
    );

    patchWrappedFlagsForWidenReflow(terminal, 80);

    expect(cursorLine.isWrapped).toBe(false);
  });
});
