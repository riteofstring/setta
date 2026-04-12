import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

type TerminalBufferLineLike = {
  isWrapped?: boolean;
  _isWrapped?: boolean;
  getTrimmedLength?: () => number;
  getCodePoint?: (index: number) => number | null | undefined;
};

type TerminalLineViewLike = {
  isWrapped?: boolean;
  _line?: TerminalBufferLineLike;
  _bufferLine?: TerminalBufferLineLike;
  translateToString?: (trimRight?: boolean) => string;
};

type TerminalActiveBufferLike = {
  length: number;
  baseY: number;
  cursorY: number;
  getLine: (y: number) => TerminalLineViewLike | null | undefined;
};

type TerminalBufferLinesLike = {
  get?: (y: number) => TerminalBufferLineLike | null | undefined;
};

type TerminalBufferLike = {
  lines?: TerminalBufferLinesLike | null;
  _lines?: TerminalBufferLinesLike | null;
  getLine?: (y: number) => TerminalBufferLineLike | null | undefined;
};

type TerminalBufferServiceLike = {
  buffer?: TerminalBufferLike | null;
  buffers?: {
    active?: TerminalBufferLike | null;
  } | null;
};

type TerminalRenderServiceLike = {
  dimensions?: {
    css?: {
      cell?: {
        width?: number;
        height?: number;
      } | null;
    } | null;
  } | null;
  clear?: () => void;
};

type TerminalInternalsLike = Terminal & {
  _core?: {
    _bufferService?: TerminalBufferServiceLike | null;
    _renderService?: TerminalRenderServiceLike | null;
  } | null;
};

type FitAddonInternalsLike = FitAddon & {
  __settaProposeDisabled?: boolean;
};

type TerminalDimensions = {
  cols: number;
  rows: number;
};

type TerminalScanContext = {
  active: TerminalActiveBufferLike;
  internalBuffer: TerminalBufferLike | null;
  internalLines: TerminalBufferLinesLike | null;
  scanStart: number;
  scanEnd: number;
};

function getFirstPresentValue<T>(
  ...candidates: Array<T | null | undefined>
): T | null {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined) {
      return candidate;
    }
  }
  return null;
}

function getActiveBuffer(terminal: Terminal): TerminalActiveBufferLike | null {
  const active = terminal.buffer
    .active as unknown as Partial<TerminalActiveBufferLike>;
  if (
    typeof active.length !== "number" ||
    typeof active.baseY !== "number" ||
    typeof active.cursorY !== "number" ||
    typeof active.getLine !== "function" ||
    active.length <= 0
  ) {
    return null;
  }
  return active as TerminalActiveBufferLike;
}

function findCursorWrappedGroupStart(
  active: TerminalActiveBufferLike,
  absCursorY: number,
): number {
  let cursorGroupStart = absCursorY;
  while (cursorGroupStart > 0 && active.getLine(cursorGroupStart)?.isWrapped) {
    cursorGroupStart -= 1;
  }
  return cursorGroupStart;
}

function getScanBounds(
  active: TerminalActiveBufferLike,
): { scanStart: number; scanEnd: number } | null {
  const absCursorY = active.baseY + active.cursorY;
  const scanStart = Math.max(1, absCursorY - 400);
  const scanEnd = Math.min(
    active.length - 1,
    findCursorWrappedGroupStart(active, absCursorY) - 1,
  );
  if (scanEnd < scanStart) {
    return null;
  }
  return {
    scanStart,
    scanEnd,
  };
}

function getPrimaryInternalBuffer(
  terminal: Terminal,
): TerminalBufferLike | null {
  const bufferService = (terminal as TerminalInternalsLike)._core
    ?._bufferService;
  return bufferService?.buffer ?? bufferService?.buffers?.active ?? null;
}

function getInternalBufferLines(
  terminal: Terminal,
  internalBuffer: TerminalBufferLike | null,
): TerminalBufferLinesLike | null {
  return getFirstPresentValue(
    internalBuffer?.lines,
    internalBuffer?._lines,
    (terminal as TerminalInternalsLike)._core?._bufferService?.buffers?.active
      ?.lines,
  );
}

function getInternalLineSources(
  terminal: Terminal,
): Pick<TerminalScanContext, "internalBuffer" | "internalLines"> {
  const internalBuffer = getPrimaryInternalBuffer(terminal);
  return {
    internalBuffer,
    internalLines: getInternalBufferLines(terminal, internalBuffer),
  };
}

function createTerminalScanContext(
  terminal: Terminal,
): TerminalScanContext | null {
  const active = getActiveBuffer(terminal);
  if (!active) {
    return null;
  }
  const scanBounds = getScanBounds(active);
  if (!scanBounds) {
    return null;
  }
  const { internalBuffer, internalLines } = getInternalLineSources(terminal);

  return {
    active,
    internalBuffer,
    internalLines,
    ...scanBounds,
  };
}

function readInternalLine(
  lineView: TerminalLineViewLike | null | undefined,
  y: number,
  context: Pick<TerminalScanContext, "internalBuffer" | "internalLines">,
): TerminalBufferLineLike | null {
  if (!lineView) {
    return null;
  }
  return getFirstPresentValue(
    lineView._line,
    lineView._bufferLine,
    context.internalLines?.get?.(y),
    context.internalBuffer?.getLine?.(y),
  );
}

function getTrimmedLength(
  line: TerminalBufferLineLike | null,
  lineView: TerminalLineViewLike | null | undefined,
): number {
  if (typeof line?.getTrimmedLength === "function") {
    return line.getTrimmedLength();
  }
  if (typeof lineView?.translateToString === "function") {
    return lineView.translateToString(true).length;
  }
  return 0;
}

function previousLineLooksHardWrapped(
  prev: TerminalBufferLineLike,
  prevView: TerminalLineViewLike | null | undefined,
  oldCols: number,
): boolean {
  const prevTrimmedLength = getTrimmedLength(prev, prevView);
  if (prevTrimmedLength !== oldCols && prevTrimmedLength !== oldCols - 1) {
    return false;
  }
  if (prevTrimmedLength !== oldCols) {
    return true;
  }
  const lastCodePoint = prev.getCodePoint?.(oldCols - 1) ?? null;
  return lastCodePoint !== 0 && lastCodePoint !== 32 && lastCodePoint !== 9;
}

function shouldPatchWrappedLine({
  line,
  lineView,
  prev,
  prevView,
  oldCols,
}: {
  line: TerminalBufferLineLike | null;
  lineView: TerminalLineViewLike | null | undefined;
  prev: TerminalBufferLineLike | null;
  prevView: TerminalLineViewLike | null | undefined;
  oldCols: number;
}): line is TerminalBufferLineLike {
  if (!line || !prev || line.isWrapped) {
    return false;
  }
  if (getTrimmedLength(line, lineView) === 0) {
    return false;
  }
  return previousLineLooksHardWrapped(prev, prevView, oldCols);
}

function markLineWrapped(line: TerminalBufferLineLike): void {
  if ("isWrapped" in line) {
    line.isWrapped = true;
    return;
  }
  if ("_isWrapped" in line) {
    line._isWrapped = true;
  }
}

export function patchWrappedFlagsForWidenReflow(
  terminal: Terminal,
  oldCols: number,
): void {
  const context = createTerminalScanContext(terminal);
  if (!context) {
    return;
  }

  for (let y = context.scanStart; y <= context.scanEnd; y += 1) {
    const prevView = context.active.getLine(y - 1);
    const lineView = context.active.getLine(y);
    const prev = readInternalLine(prevView, y - 1, context);
    const line = readInternalLine(lineView, y, context);
    if (!shouldPatchWrappedLine({ line, lineView, prev, prevView, oldCols })) {
      continue;
    }
    markLineWrapped(line);
  }
}

function getDomScrollBarWidth(terminal: Terminal): number {
  if (terminal.options.scrollback === 0) {
    return 0;
  }
  const element = terminal.element;
  if (!element) {
    return 0;
  }
  const viewport = element.querySelector(".xterm-viewport");
  if (!(viewport instanceof HTMLElement)) {
    return 0;
  }
  return Math.max(0, viewport.offsetWidth - viewport.clientWidth);
}

function isPositiveTerminalCellSize(
  value: number | undefined,
): value is number {
  return typeof value === "number" && value > 0;
}

function getRenderCellSize(terminal: Terminal): {
  width: number | undefined;
  height: number | undefined;
} {
  const cell = (terminal as TerminalInternalsLike)._core?._renderService
    ?.dimensions?.css?.cell;
  return {
    width: cell?.width,
    height: cell?.height,
  };
}

function readCellDimensions(
  terminal: Terminal,
): { cellWidth: number; cellHeight: number } | null {
  const { width, height } = getRenderCellSize(terminal);
  const cellWidth = width;
  const cellHeight = height;
  if (
    !isPositiveTerminalCellSize(cellWidth) ||
    !isPositiveTerminalCellSize(cellHeight)
  ) {
    return null;
  }
  return {
    cellWidth,
    cellHeight,
  };
}

function readParentSize(parentElement: HTMLElement): {
  parentHeight: number;
  parentWidth: number;
} | null {
  const parentHeight = parentElement.clientHeight;
  const parentWidth = parentElement.clientWidth;
  if (
    !Number.isFinite(parentHeight) ||
    !Number.isFinite(parentWidth) ||
    parentHeight <= 0 ||
    parentWidth <= 0
  ) {
    return null;
  }
  return {
    parentHeight,
    parentWidth,
  };
}

function readTerminalPadding(element: HTMLElement): {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
} | null {
  const termStyle = window.getComputedStyle(element);
  const paddingTop = parseFloat(termStyle.getPropertyValue("padding-top"));
  const paddingBottom = parseFloat(
    termStyle.getPropertyValue("padding-bottom"),
  );
  const paddingLeft = parseFloat(termStyle.getPropertyValue("padding-left"));
  const paddingRight = parseFloat(termStyle.getPropertyValue("padding-right"));
  if (
    !Number.isFinite(paddingTop) ||
    !Number.isFinite(paddingBottom) ||
    !Number.isFinite(paddingLeft) ||
    !Number.isFinite(paddingRight)
  ) {
    return null;
  }
  return {
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
  };
}

function proposeDimensionsFallback(
  terminal: Terminal,
): TerminalDimensions | null {
  const element = terminal.element;
  const parentElement = element?.parentElement;
  if (!element || !parentElement) {
    return null;
  }

  const cellDimensions = readCellDimensions(terminal);
  const parentSize = readParentSize(parentElement);
  const padding = readTerminalPadding(element);
  if (!cellDimensions || !parentSize || !padding) {
    return null;
  }

  const availableHeight =
    parentSize.parentHeight - (padding.paddingTop + padding.paddingBottom);
  const availableWidth =
    parentSize.parentWidth -
    (padding.paddingLeft + padding.paddingRight) -
    getDomScrollBarWidth(terminal);
  return {
    cols: Math.max(2, Math.floor(availableWidth / cellDimensions.cellWidth)),
    rows: Math.max(1, Math.floor(availableHeight / cellDimensions.cellHeight)),
  };
}

function readFitAddonProposal(fitAddon: FitAddon): TerminalDimensions | null {
  const fitAddonWithState = fitAddon as FitAddonInternalsLike;
  if (fitAddonWithState.__settaProposeDisabled) {
    return null;
  }

  try {
    const proposed = fitAddon.proposeDimensions();
    if (!proposed) {
      return null;
    }
    return {
      cols: proposed.cols,
      rows: proposed.rows,
    };
  } catch {
    fitAddonWithState.__settaProposeDisabled = true;
    return null;
  }
}

function clearTerminalRender(terminal: Terminal): void {
  (terminal as TerminalInternalsLike)._core?._renderService?.clear?.();
}

function resizeTerminal(
  terminal: Terminal,
  proposed: TerminalDimensions,
): void {
  if (
    proposed.cols <= 0 ||
    proposed.rows <= 0 ||
    (terminal.cols === proposed.cols && terminal.rows === proposed.rows)
  ) {
    return;
  }
  clearTerminalRender(terminal);
  terminal.resize(proposed.cols, proposed.rows);
}

function isVisibleTerminalContainer(container: HTMLDivElement): boolean {
  return container.clientWidth >= 16 && container.clientHeight >= 16;
}

export function fitTerminal({
  container,
  fitAddon,
  terminal,
}: {
  container: HTMLDivElement;
  fitAddon: FitAddon;
  terminal: Terminal;
}): void {
  if (!isVisibleTerminalContainer(container)) {
    return;
  }

  const proposed =
    readFitAddonProposal(fitAddon) ?? proposeDimensionsFallback(terminal);
  if (!proposed) {
    return;
  }
  if (proposed.cols > terminal.cols && terminal.cols > 0) {
    patchWrappedFlagsForWidenReflow(terminal, terminal.cols);
  }
  resizeTerminal(terminal, proposed);
}
