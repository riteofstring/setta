import { expect, type Locator, type Page } from "@playwright/test";
export {
  BASE_URL,
  createCodeSection,
  createNewProjectConfig,
  createTerminalSection,
  createTopLevelSectionOfType,
  deleteProjectConfigById,
  getProjectConfigName,
  HOME_URL,
  loadProjectState,
  moveSectionsViaBackend,
  PROJECT_URL,
  READY_SELECTOR,
  resolveProjectConfigId,
  resolveProjectUrl,
  resolveSectionImpl,
  waitForAttachedTerminalId,
} from "./code-section-terminal-attachment-project-helpers";

export async function runCodeBlockInPage(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const { useProjectState } = await import("/src/state/definitions");
    const { runCodeBlock } = await import("/src/state/actions/runOrImportCode");
    const sectionCapabilities = useProjectState.getState().sectionCapabilities[
      id
    ];
    if (!sectionCapabilities?.canRun) {
      throw new Error(
        `Code section ${id} is not runnable: ${sectionCapabilities?.runDisabledReason ?? "missing run capability"}`,
      );
    }
    await runCodeBlock(id);
  }, sectionId);
}

export async function setCodeForSection(
  page: Page,
  sectionId: string,
  code: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, value }) => {
      const { queueCodeUpdate, flushPendingCodeUpdate } = await import(
        "/src/state/actions/codeUpdates"
      );
      const { getLatestProjectState } = await import("/src/openapi/http");
      const { callOpenAPI } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { getCurrProjectConfigId, processProjectStateUpdateFromBackend } =
        await import("/src/state/actions/sectionInfos");
      queueCodeUpdate(id, value);
      await flushPendingCodeUpdate(id);
      const projectConfigId = getCurrProjectConfigId();
      const latestProjectStateResponse = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
      if (
        latestProjectStateResponse.status !== 200 ||
        !latestProjectStateResponse.data
      ) {
        throw new Error(
          `Failed to hydrate latest project state for ${projectConfigId}: ${latestProjectStateResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
    },
    { id: sectionId, value: code },
  );
}

export async function setSectionHeight(
  page: Page,
  sectionId: string,
  height: number,
): Promise<void> {
  await setSectionSize(page, sectionId, { height });
}

export async function setSectionSize(
  page: Page,
  sectionId: string,
  size: { width?: number; height?: number },
): Promise<void> {
  await page.evaluate(
    async ({ id, nextSize }) => {
      const { dispatchOptimisticProjectStateUpdate, getCurrProjectConfigId } =
        await import("/src/state/actions/sectionInfos");
      const { setSectionSizes } = await import("/src/openapi/http");
      const { callOpenAPI } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { setSelfParentSiblingChildrenWidths } = await import(
        "/src/state/actions/sections/sectionSizes"
      );
      let updatedSectionSizes = {};
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          updatedSectionSizes = setSelfParentSiblingChildrenWidths(
            id,
            nextSize,
            state,
          );
        },
        send: (frontendOpId) =>
          callOpenAPI(
            setSectionSizes({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionSizes: updatedSectionSizes,
                frontendOpId,
              },
            } as Parameters<typeof setSectionSizes>[0]),
          ),
      });
    },
    { id: sectionId, nextSize: size },
  );
}

export async function getTerminalRowsSnapshot(
  page: Page,
  terminalId: string,
): Promise<string[]> {
  return await page.evaluate((id) => {
    const collectRows = (container: Element | null): string[] => {
      if (!container) {
        return [];
      }
      // Ensure we sample the bottom of the terminal so recently-echoed input is
      // visible even if the viewport was scrolled during attach/resize.
      const viewport = container.querySelector(".xterm-viewport");
      if (viewport instanceof HTMLElement) {
        viewport.scrollTop = viewport.scrollHeight;
      }
      const rows = container.querySelectorAll(".xterm-rows > div");
      return Array.from(rows).map((row) => row.textContent ?? "");
    };

    const candidates: Element[] = Array.from(
      document.querySelectorAll(`[data-attached-terminal-section-id="${id}"]`),
    );
    const detached = document.querySelector(
      `.setta-gpu-flow__node[data-id="${id}"]`,
    );
    if (detached) {
      candidates.push(detached);
    }

    const active = document.activeElement;
    if (active instanceof Element) {
      const activeEmbedded = active.closest(
        `[data-attached-terminal-section-id="${id}"]`,
      );
      const activeDetached = active.closest(
        `.setta-gpu-flow__node[data-id="${id}"]`,
      );
      const activeContainer = activeEmbedded ?? activeDetached;
      const activeRows = collectRows(activeContainer);
      if (activeRows.length > 0) {
        return activeRows;
      }
    }

    let bestRows: string[] = [];
    let bestScore = -1;
    for (const candidate of candidates) {
      const rows = collectRows(candidate);
      if (rows.length === 0) {
        continue;
      }
      const nonEmpty = rows.filter((row) => row.trim().length > 0).length;
      const joinedLength = rows.reduce((sum, row) => sum + row.length, 0);
      const inLayout =
        candidate instanceof HTMLElement &&
        candidate.getClientRects().length > 0;
      const score =
        (inLayout ? 1_000_000_000 : 0) + nonEmpty * 10_000 + joinedLength;
      if (score > bestScore) {
        bestScore = score;
        bestRows = rows;
      }
    }
    return bestRows;
  }, terminalId);
}

export async function getTerminalReadyCount(
  page: Page,
  terminalId: string,
): Promise<number> {
  return await page.evaluate((id) => {
    const readyCountMap = window as typeof window & {
      __terminalReadyCountBySectionId?: Record<string, number>;
      __terminalReadyBySectionId?: Record<string, boolean>;
    };
    const readyCount = readyCountMap.__terminalReadyCountBySectionId?.[id];
    if (typeof readyCount === "number") {
      return readyCount;
    }
    return readyCountMap.__terminalReadyBySectionId?.[id] ? 1 : 0;
  }, terminalId);
}

export function countLongLineRows(rows: string[], marker: string): number {
  return rows.filter((row) => {
    const trimmed = row.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.includes(marker)) {
      return true;
    }
    if (/^x+$/.test(trimmed)) {
      return true;
    }
    // Some terminals (and zsh line editing) can produce wrap continuations that
    // include prefix characters (digits/underscores) in addition to the x-tail.
    // Count any row with a sufficiently-long x run as part of the wrapped line.
    return /x{20,}/.test(trimmed);
  }).length;
}

export function countLongLineWrapRows(rows: string[], marker: string): number {
  const markerPrefix = `${marker}_`;
  return rows.filter((row) => {
    const trimmed = row.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.includes(markerPrefix)) {
      return true;
    }
    if (/^x+$/.test(trimmed)) {
      return true;
    }
    return /x{20,}/.test(trimmed);
  }).length;
}

export function getEmbeddedTerminalHost(
  page: Page,
  terminalId: string,
): Locator {
  return page.locator(`[data-attached-terminal-section-id="${terminalId}"]`);
}

export function getEmbeddedTerminalSection(
  page: Page,
  terminalId: string,
): Locator {
  return getEmbeddedTerminalHost(page, terminalId).locator(
    "xpath=ancestor::section[1]",
  );
}

export function getGpuFlowNode(page: Page, sectionId: string): Locator {
  return page.locator(`.setta-gpu-flow__node[data-id="${sectionId}"]`);
}

export async function getGpuFlowNodeScreenRect(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const rect = await page.evaluate((id) => {
    const view = window as typeof window & {
      __settaGpuFlowNodeScreenRect?:
        | ((
            nodeId: string,
          ) => { height: number; width: number; x: number; y: number } | null)
        | undefined;
    };
    return view.__settaGpuFlowNodeScreenRect?.(id) ?? null;
  }, sectionId);
  if (!rect) {
    throw new Error(`Missing GPU flow screen rect for ${sectionId}.`);
  }
  return rect;
}

async function projectGpuSourceNodeForTest(
  page: Page,
  sectionId: string,
): Promise<void> {
  const visualRect = await getGpuFlowNodeScreenRect(page, sectionId);
  await page.evaluate(
    ({ id, rect }) => {
      const node = document.querySelector<HTMLElement>(
        `.setta-gpu-flow__node[data-id="${id}"]`,
      );
      if (!node) {
        throw new Error(`Missing GPU source node for ${id}.`);
      }
      const parentRect =
        node.offsetParent instanceof HTMLElement
          ? node.offsetParent.getBoundingClientRect()
          : { left: 0, top: 0 };
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      if (width <= 0 || height <= 0) {
        throw new Error(`Cannot project zero-size GPU source node ${id}.`);
      }
      const scaleX = rect.width / width;
      const scaleY = rect.height / height;
      node.style.pointerEvents = "auto";
      node.style.transform = `translate(${rect.x - parentRect.left}px, ${
        rect.y - parentRect.top
      }px) scale(${scaleX}, ${scaleY})`;
      node.setAttribute("data-gpu-flow-projected-interaction", "true");
    },
    { id: sectionId, rect: visualRect },
  );
}

export async function clickGpuSourceControl(control: Locator): Promise<void> {
  await control.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("GPU source control target is not an HTMLElement.");
    }
    element.click();
  });
}

export async function syncEmbeddedTerminalSectionSize(
  page: Page,
  terminalId: string,
  embeddedTerminalHost: Locator,
): Promise<{ width: number; height: number }> {
  const embeddedTerminal = embeddedTerminalHost.locator(
    "xpath=ancestor::section[1]",
  );
  await expect(embeddedTerminal).toBeVisible();
  const terminalBox = await embeddedTerminal.boundingBox();
  if (!terminalBox) {
    throw new Error("Missing embedded terminal bounding box.");
  }
  const size = {
    width: Math.round(terminalBox.width),
    height: Math.round(terminalBox.height),
  };
  await setSectionSize(page, terminalId, size);
  return size;
}

export async function focusTerminalAndType(
  page: Page,
  terminalId: string,
  text: string,
): Promise<void> {
  const detachedTerminalNode = getGpuFlowNode(page, terminalId);
  const embeddedTerminalHost = getEmbeddedTerminalHost(page, terminalId);
  const embeddedCount = await embeddedTerminalHost.count();
  const detachedCount = await detachedTerminalNode.count();
  let root: Locator | null = null;
  if (embeddedCount > 0) {
    root = embeddedTerminalHost.locator("xpath=ancestor::section[1]");
  } else if (detachedCount > 0) {
    root = detachedTerminalNode;
  }
  if (!root) {
    throw new Error(`Missing terminal DOM for ${terminalId}.`);
  }

  const terminalContainer = root.locator(".xterm");
  await expect(terminalContainer).toBeVisible();
  const input = root.locator(".xterm-helper-textarea, .xterm textarea");
  await input.first().waitFor({ state: "attached", timeout: 20000 });
  await input.first().evaluate((el) => {
    if (el instanceof HTMLTextAreaElement) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
      return;
    }
    (el as HTMLElement).focus();
  });
  await expect
    .poll(async () => {
      return await input
        .first()
        .evaluate((el) => document.activeElement === el);
    })
    .toBe(true);
  await page.waitForTimeout(50);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

export async function addTerminalOutputInstrumentation(
  page: Page,
): Promise<void> {
  await page.addInitScript(() => {
    const windowWithOutput = window as typeof window & {
      __terminalOutputInstrumented?: boolean;
      __terminalOutputBySectionId?: Record<string, string>;
      __terminalReadyBySectionId?: Record<string, boolean>;
      __terminalReadyCountBySectionId?: Record<string, number>;
    };
    if (!windowWithOutput.__terminalOutputBySectionId) {
      windowWithOutput.__terminalOutputBySectionId = {};
    }
    if (!windowWithOutput.__terminalReadyBySectionId) {
      windowWithOutput.__terminalReadyBySectionId = {};
    }
    if (!windowWithOutput.__terminalReadyCountBySectionId) {
      windowWithOutput.__terminalReadyCountBySectionId = {};
    }
    const currentWebSocket = WebSocket as typeof WebSocket & {
      __terminalOutputWrapped?: boolean;
    };
    if (!currentWebSocket.__terminalOutputWrapped) {
      const OriginalWebSocket = WebSocket;
      const WrappedWebSocket = function (
        this: WebSocket,
        url: string | URL,
        protocols?: string | string[],
      ) {
        const socket =
          protocols === undefined
            ? new OriginalWebSocket(url)
            : new OriginalWebSocket(url, protocols);
        socket.addEventListener("message", (event) => {
          const appendOutput = (text: string) => {
            if (!text) {
              return;
            }
            try {
              const urlObj = new URL(socket.url);
              const parts = urlObj.pathname.split("/").filter(Boolean);
              const sectionId = parts.at(-1) ?? "unknown";
              windowWithOutput.__terminalOutputBySectionId![sectionId] =
                (windowWithOutput.__terminalOutputBySectionId![sectionId] ??
                  "") + text;
            } catch {
              // Ignore output parse errors.
            }
          };

          if (typeof event.data === "string") {
            if (event.data === "SETTA_TERMINAL_READY") {
              try {
                const urlObj = new URL(socket.url);
                const parts = urlObj.pathname.split("/").filter(Boolean);
                const sectionId = parts.at(-1) ?? "unknown";
                windowWithOutput.__terminalReadyBySectionId![sectionId] = true;
                windowWithOutput.__terminalReadyCountBySectionId![sectionId] =
                  (windowWithOutput.__terminalReadyCountBySectionId![
                    sectionId
                  ] ?? 0) + 1;
              } catch {
                // Ignore parse errors.
              }
              return;
            }
            appendOutput(event.data);
            return;
          }
          if (event.data instanceof ArrayBuffer) {
            appendOutput(new TextDecoder().decode(event.data));
            return;
          }
          if (event.data instanceof Blob) {
            event.data
              .arrayBuffer()
              .then((buffer) => {
                appendOutput(new TextDecoder().decode(buffer));
              })
              .catch(() => {
                // Ignore decode errors.
              });
          }
        });
        return socket;
      } as typeof WebSocket;
      WrappedWebSocket.prototype = OriginalWebSocket.prototype;
      Object.assign(WrappedWebSocket, OriginalWebSocket);
      (
        WrappedWebSocket as typeof WebSocket & {
          __terminalOutputWrapped?: boolean;
        }
      ).__terminalOutputWrapped = true;
      window.WebSocket = WrappedWebSocket;
    }
    windowWithOutput.__terminalOutputInstrumented = true;
  });
}

export async function getTerminalOutputBuffer(
  page: Page,
  terminalId: string,
): Promise<string> {
  return await page.evaluate((id) => {
    return (
      (
        window as typeof window & {
          __terminalOutputBySectionId?: Record<string, string>;
        }
      ).__terminalOutputBySectionId?.[id] ?? ""
    );
  }, terminalId);
}

export async function waitForTerminalOutputToStabilize(
  page: Page,
  terminalId: string,
  options?: {
    timeoutMs?: number;
    stableMs?: number;
    pollMs?: number;
  },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const stableMs = options?.stableMs ?? 500;
  const pollMs = options?.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  let previousLength = (await getTerminalOutputBuffer(page, terminalId)).length;
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    const nextLength = (await getTerminalOutputBuffer(page, terminalId)).length;
    if (nextLength === previousLength) {
      if (Date.now() - stableSince >= stableMs) {
        return;
      }
      continue;
    }
    previousLength = nextLength;
    stableSince = Date.now();
  }

  throw new Error(
    `Timed out waiting for terminal ${terminalId} output to stabilize.`,
  );
}

export async function waitForTerminalOutputMarker(
  page: Page,
  terminalId: string,
  marker: string,
  timeoutMs = 20000,
): Promise<void> {
  const normalizedMarker = normalizeTerminalCapturedOutput(marker);
  await expect
    .poll(
      async () => {
        const normalizedOutput = normalizeTerminalCapturedOutput(
          await getTerminalOutputBuffer(page, terminalId),
        );
        if (normalizedOutput.includes(normalizedMarker)) {
          return true;
        }
        const normalizedRows = normalizeTerminalCapturedOutput(
          (await getTerminalRowsSnapshot(page, terminalId)).join(""),
        );
        return normalizedRows.includes(normalizedMarker);
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

export async function waitForTerminalRowsMarker(
  page: Page,
  terminalId: string,
  marker: string,
  timeoutMs = 20000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        // Marker can be split across wrapped rows (no single row contains it).
        const joined = rows.join("");
        if (joined.includes(marker)) {
          return true;
        }
        // In some cases the wrapped row ends up with terminal fill whitespace in
        // the middle of the marker; strip whitespace and try again.
        return joined.replaceAll(/\s+/g, "").includes(marker);
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

export async function waitForTerminalReady(
  page: Page,
  terminalId: string,
  options?: {
    timeoutMs?: number;
    required?: boolean;
    minReadyCount?: number;
  },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 20000;
  const required = options?.required ?? true;
  const minReadyCount = options?.minReadyCount ?? 1;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const readyCount = await page.evaluate((id) => {
      const readyMap = window as typeof window & {
        __terminalReadyBySectionId?: Record<string, boolean>;
        __terminalReadyCountBySectionId?: Record<string, number>;
      };
      const count = readyMap.__terminalReadyCountBySectionId?.[id];
      if (typeof count === "number") {
        return count;
      }
      return readyMap.__terminalReadyBySectionId?.[id] ? 1 : 0;
    }, terminalId);
    if (readyCount >= minReadyCount) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  if (required) {
    throw new Error(`Timed out waiting for terminal ${terminalId} readiness.`);
  }
  return false;
}

export function normalizeTerminalCapturedOutput(value: string): string {
  return value
    .replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replaceAll(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replaceAll(/\u0008/g, "")
    .replaceAll(/\r/g, "")
    .replaceAll(/\s+/g, "");
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    throw new Error("Expected non-empty needle for countOccurrences.");
  }
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export async function ensureTerminalAcceptsInput(
  page: Page,
  terminalId: string,
  marker: string,
  options?: { timeoutMs?: number; attemptTimeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const attemptTimeoutMs = options?.attemptTimeoutMs ?? 8000;
  const deadline = Date.now() + timeoutMs;

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    await focusTerminalAndType(page, terminalId, `echo ${marker}`);
    try {
      await waitForTerminalOutputMarker(
        page,
        terminalId,
        marker,
        attemptTimeoutMs,
      );
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }

  const output = await getTerminalOutputBuffer(page, terminalId);
  const tail = output.slice(Math.max(0, output.length - 2000));
  throw new Error(
    `Timed out waiting for terminal ${terminalId} to accept input (marker ${marker}).\n\nOutput tail:\n${tail}`,
  );
}

export async function waitForTerminalResizeCountsToStabilize(
  page: Page,
  terminalId: string,
  options?: { timeoutMs?: number; stableMs?: number; pollMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const stableMs = options?.stableMs ?? 500;
  const pollMs = options?.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  const getResizeCountSum = async () => {
    return await page.evaluate((id) => {
      const counts = window.__terminalResizeCountsBySectionId?.[id];
      if (!counts) {
        return 0;
      }
      return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
    }, terminalId);
  };

  let previousCount = await getResizeCountSum();
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    const nextCount = await getResizeCountSum();
    if (nextCount === previousCount) {
      if (Date.now() - stableSince >= stableMs) {
        return;
      }
      continue;
    }
    previousCount = nextCount;
    stableSince = Date.now();
  }

  throw new Error(
    `Timed out waiting for terminal ${terminalId} resize counts to stabilize.`,
  );
}

export async function getTerminalLastResize(
  page: Page,
  terminalId: string,
): Promise<{ cols: number; rows: number } | null> {
  return await page.evaluate((id) => {
    const entry = window.__terminalLastResizeBySectionId?.[id];
    if (!entry) {
      return null;
    }
    if (typeof entry.cols !== "number" || typeof entry.rows !== "number") {
      return null;
    }
    return { cols: entry.cols, rows: entry.rows };
  }, terminalId);
}

export async function addTerminalResizeInstrumentation(
  page: Page,
): Promise<void> {
  await page.addInitScript(() => {
    if (window.__terminalResizeInstrumented) {
      return;
    }
    window.__terminalResizeInstrumented = true;
    window.__terminalResizePhase = "idle";
    window.__terminalResizeCountsBySectionId = {};
    window.__terminalLastResizeBySectionId = {};
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        if (typeof data === "string") {
          const parsed = JSON.parse(data);
          if (parsed?.messageType === "terminalResize") {
            const url = new URL(this.url);
            const parts = url.pathname.split("/").filter(Boolean);
            const sectionId = parts.at(-1) ?? "unknown";
            const phase = window.__terminalResizePhase ?? "idle";
            if (!window.__terminalResizeCountsBySectionId[sectionId]) {
              window.__terminalResizeCountsBySectionId[sectionId] = {
                drag: 0,
                post: 0,
                idle: 0,
              };
            }
            const counts = window.__terminalResizeCountsBySectionId[sectionId];
            counts[phase] = (counts[phase] ?? 0) + 1;
            if (
              typeof parsed.cols === "number" &&
              typeof parsed.rows === "number"
            ) {
              window.__terminalLastResizeBySectionId[sectionId] = {
                cols: parsed.cols,
                rows: parsed.rows,
              };
            }
          }
        }
      } catch {
        // Ignore parse errors and fall through to the original send.
      }
      return originalSend.apply(this, arguments);
    };
  });
}

export async function focusPaneForDnd(page: Page): Promise<void> {
  await page.click(".setta-gpu-flow__pane", {
    position: { x: 8, y: 8 },
    force: true,
  });
}

export async function activateMovingFreeDragMode(
  page: Page,
): Promise<() => Promise<void>> {
  await page.keyboard.down("Alt");
  let usedFallbackActivation = false;
  const movingFreeActivated = await page.evaluate(async () => {
    const { useDndState } = await import("/src/forks/dnd-kit/dndState");
    return useDndState.getState().isMovingFree;
  });
  if (!movingFreeActivated) {
    usedFallbackActivation = true;
    await page.evaluate(async () => {
      const { activateDndMovingFreeMode } = await import(
        "/src/forks/dnd-kit/dndState"
      );
      activateDndMovingFreeMode();
    });
  }
  return async () => {
    await page.keyboard.up("Alt");
    if (!usedFallbackActivation) {
      return;
    }
    await page.evaluate(async () => {
      const { forceDeactivateDnd } = await import(
        "/src/forks/dnd-kit/dndState"
      );
      forceDeactivateDnd();
    });
  };
}

export async function resetViewport(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const viewportStore = gpuFlowViewportStore.getState();
    viewportStore.setTransform({ x: 0, y: 0, zoom: 1 });
    viewportStore.setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    window.settaGpuFlowZoom = 1;
  });
}

export function getDragStartPoint(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  const offset = 12;
  return {
    x: box.x + Math.min(offset, box.width / 2),
    y: box.y + Math.min(offset, box.height / 2),
  };
}

export function getDetachTargetPoint({
  paneBox,
  codeBox,
  attempt,
}: {
  paneBox: { x: number; y: number; width: number; height: number };
  codeBox: { x: number; y: number; width: number; height: number };
  attempt: number;
}): { x: number; y: number } {
  const margin = 40;
  const centerX = codeBox.x + codeBox.width / 2;
  const centerY = codeBox.y + codeBox.height / 2;
  const stepOffset = attempt * 40;
  const verticalOffset = attempt * 20;
  const candidates = [
    { x: codeBox.x + codeBox.width + 320 + stepOffset, y: codeBox.y + 40 },
    { x: codeBox.x - 320 - stepOffset, y: codeBox.y + 40 },
    { x: centerX, y: centerY + 240 + verticalOffset },
    { x: centerX, y: centerY - 240 - verticalOffset },
  ].map((point) => ({
    x: clamp(point.x, paneBox.x + margin, paneBox.x + paneBox.width - margin),
    y: clamp(point.y, paneBox.y + margin, paneBox.y + paneBox.height - margin),
  }));

  const startIndex = attempt % candidates.length;
  const ordered = candidates
    .slice(startIndex)
    .concat(candidates.slice(0, startIndex));
  const picked = ordered.find((point) => isPointOutsideBox(codeBox, point, 20));
  return picked ?? candidates[0];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function dragSelectTerminalMarkerRangeAndCopy({
  page,
  terminalId,
  marker,
  startOffset,
  endOffset,
}: {
  page: Page;
  terminalId: string;
  marker: string;
  startOffset: number;
  endOffset: number;
}): Promise<string> {
  let lastSelection = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await projectGpuSourceNodeForTest(page, terminalId);
    const start = await getTerminalMarkerCharCenter({
      page,
      terminalId,
      marker,
      markerOffset: startOffset,
    });
    const end = await getTerminalMarkerCharCenter({
      page,
      terminalId,
      marker,
      markerOffset: endOffset,
    });

    const offsetSpan = Math.abs(endOffset - startOffset);
    const deltaX = end.x - start.x;
    const estimatedCellWidth =
      offsetSpan > 0 ? Math.abs(deltaX) / offsetSpan : 10;
    // Drag from just inside the start cell to just inside the end cell so
    // integer mouse coordinate rounding at different zoom levels doesn't drop
    // boundary characters.
    const pad = Math.min(Math.max(estimatedCellWidth * 0.45, 2), 14);
    const startX = start.x - pad;
    const endX = end.x + pad;

    await page.mouse.move(startX, start.y);
    await page.mouse.down();
    await page.mouse.move(endX, end.y, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    lastSelection = await copyTerminalSelection(page, terminalId);
    if (lastSelection.replace(/\r/g, "").trim().length > 0) {
      return lastSelection;
    }
    await page.waitForTimeout(100);
  }

  return lastSelection;
}

export async function getTerminalMarkerCharCenter({
  page,
  terminalId,
  marker,
  markerOffset,
}: {
  page: Page;
  terminalId: string;
  marker: string;
  markerOffset: number;
}): Promise<{ x: number; y: number }> {
  await projectGpuSourceNodeForTest(page, terminalId);
  return await page.evaluate(
    ({ id, marker, markerOffset }) => {
      const embedded = document.querySelector(
        `[data-attached-terminal-section-id="${id}"]`,
      );
      const container =
        embedded ??
        document.querySelector(`.setta-gpu-flow__node[data-id="${id}"]`);
      if (!container) {
        throw new Error(`Missing terminal container for ${id}.`);
      }

      const rows = Array.from(container.querySelectorAll(".xterm-rows > div"));
      const row = rows.find((row) => (row.textContent ?? "").includes(marker));
      if (!row) {
        throw new Error(`Missing terminal row for marker ${marker}.`);
      }

      const rowText = row.textContent ?? "";
      const markerStart = rowText.indexOf(marker);
      if (markerStart < 0) {
        throw new Error("Marker not found in row text.");
      }
      const targetIndex = markerStart + markerOffset;
      if (
        targetIndex < markerStart ||
        targetIndex >= markerStart + marker.length
      ) {
        throw new Error("Requested markerOffset is out of bounds.");
      }

      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let remaining = targetIndex;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!(node instanceof Text)) {
          continue;
        }
        const text = node.textContent ?? "";
        if (remaining < text.length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.setEnd(node, remaining + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            };
          }
          const rowRect = row.getBoundingClientRect();
          return { x: rowRect.left + 2, y: rowRect.top + rowRect.height / 2 };
        }
        remaining -= text.length;
      }
      throw new Error("Unable to resolve marker character position.");
    },
    { id: terminalId, marker, markerOffset },
  );
}

export async function copyTerminalSelection(
  page: Page,
  terminalId: string,
): Promise<string> {
  return await page.evaluate((id) => {
    const embedded = document.querySelector(
      `[data-attached-terminal-section-id="${id}"]`,
    );
    const container =
      embedded ??
      document.querySelector(`.setta-gpu-flow__node[data-id="${id}"]`);
    if (!container) {
      throw new Error(`Missing terminal container for ${id}.`);
    }
    const textarea = container.querySelector(
      ".xterm-helper-textarea, .xterm textarea",
    );
    const xterm = container.querySelector(".xterm");
    const target = (textarea ?? xterm) as HTMLElement | null;
    if (!target) {
      throw new Error("Missing xterm element.");
    }
    // xterm wires clipboard handlers around its helper textarea; dispatching
    // here matches how real copy events are triggered more closely than
    // dispatching on the container.
    target.focus?.();
    const clipboardData = new DataTransfer();
    // Chromium has tightened restrictions around constructing ClipboardEvent
    // with a writable `clipboardData`. xterm only checks for the presence of
    // `event.clipboardData`, so define it manually on a standard Event.
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: clipboardData,
    });
    target.dispatchEvent(event);
    return clipboardData.getData("text/plain");
  }, terminalId);
}

export async function expectDetachedTerminalHeaderLayout(
  page: Page,
  terminalId: string,
): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate((id) => {
        const node = document.querySelector(
          `.setta-gpu-flow__node[data-id="${id}"]`,
        );
        if (!node) {
          return "missing-node";
        }
        const header = node.querySelector("header.section-title");
        if (!header) {
          return "missing-header";
        }
        const editor = node.querySelector("[data-section-main-editor]");
        if (!editor) {
          return "missing-editor";
        }
        const headerBox = header.getBoundingClientRect();
        const editorBox = editor.getBoundingClientRect();
        return editorBox.top >= headerBox.bottom - 1
          ? "ok"
          : `overlap:${Math.round(editorBox.top)}:${Math.round(headerBox.bottom)}`;
      }, terminalId);
    })
    .toBe("ok");
}

export function isPointOutsideBox(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  margin: number,
): boolean {
  return (
    point.x < box.x - margin ||
    point.x > box.x + box.width + margin ||
    point.y < box.y - margin ||
    point.y > box.y + box.height + margin
  );
}

export async function isTerminalDetachedInDom(
  page: Page,
  _sectionId: string,
  terminalId: string,
): Promise<boolean> {
  const embeddedCount = await getEmbeddedTerminalHost(page, terminalId).count();
  const terminalNodeCount = await getGpuFlowNode(page, terminalId).count();
  return embeddedCount === 0 && terminalNodeCount > 0;
}
