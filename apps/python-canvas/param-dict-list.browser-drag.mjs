import { setTimeout as delay } from "node:timers/promises";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import {
  evaluate,
  focusElement,
  nextAnimationFrame,
  prepareElementDrag,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";
import {
  captureFocusBeforeSectionMove,
  listSectionSelector,
} from "./param-dict-list.browser-support.mjs";

const sectionMoveAttemptLimit = 3;
const sectionMoveObservationTimeoutMs = 500;
const sectionMoveObservationPollIntervalMs = 50;
const sectionCanvasDropMarginPx = 16;
const sectionCanvasDropCollisionClearancePx = 8;
const workspaceCanvasPaneSelector =
  '.react-flow__pane[aria-label="Workspace canvas background"]';

export const sectionDragPointerHoldMs = 200;
export const sectionDragPointerMoveSteps = 14;

export const listNestedSectionSurfaceSelector =
  ":scope > .flex.flex-col > .flex.items-stretch > .mt-2.flex.flex-col";

export const listNestedSortableSectionSelector = `${listNestedSectionSurfaceSelector} > [data-sortable-section-id]`;

export async function dragFreeSectionToSection(
  client,
  {
    description,
    hasMoved,
    sourceSelector,
    targetSortableSelector,
    targetYFraction,
    verifyFocusContext = false,
  },
) {
  return dragSection(client, {
    description,
    hasMoved,
    mode: "free",
    sourceSelector,
    resolveTargetPoint: () =>
      visibleLeadingSortableSectionPoint(
        client,
        targetSortableSelector,
        `${description} target`,
        targetYFraction,
      ),
    targetSelector: targetSortableSelector,
    targetYFraction,
    verifyFocusContext,
  });
}

export async function dragFreeSectionToCanvas(
  client,
  {
    description,
    failureDiagnostics = null,
    hasMoved,
    sourceSelector,
    verifyFocusContext = false,
  },
) {
  return dragSection(client, {
    description,
    describeFailure:
      failureDiagnostics === null
        ? undefined
        : ({ target }) =>
            describeSectionMoveFailure({
              client,
              sourceSelector,
              target,
              ...failureDiagnostics,
            }),
    hasMoved,
    mode: "free",
    sourceSelector,
    resolveTargetPoint: (source) =>
      visibleCanvasDropPointForSection(
        client,
        sourceSelector,
        source,
        `${description} target`,
      ),
    targetSelector: workspaceCanvasPaneSelector,
    targetRetryYOffset: 0,
    verifyFocusContext,
  });
}

async function dragSection(client, configuration) {
  const { sourceSelector } = configuration;
  let focusCapture = null;
  let attemptedTarget = null;
  return retrySectionMoveUntilObserved({
    description: configuration.description,
    describeFailure: configuration.describeFailure
      ? () => configuration.describeFailure({ target: attemptedTarget })
      : undefined,
    hasMoved: configuration.hasMoved,
    performGesture: async (attempt) => {
      await focusElement(
        client,
        sourceSelector,
        `${configuration.description} source`,
      );
      await prepareElementDrag(
        client,
        sourceSelector,
        configuration.targetSelector,
        configuration.description,
      );
      const source = await sectionDragStartPoint(
        client,
        sourceSelector,
        `${configuration.description} source`,
      );
      const target = configuration.resolveTargetPoint
        ? await configuration.resolveTargetPoint(source)
        : await visibleElementPoint(
            client,
            configuration.targetSelector,
            `${configuration.description} target`,
            {
              ...configuration.targetPointOptions,
              preferredXFraction: configuration.targetXFraction ?? null,
              preferredYFraction: configuration.targetYFraction,
            },
          );
      attemptedTarget = {
        x: target.x,
        y: target.y + attempt * (configuration.targetRetryYOffset ?? 2),
      };
      await tryMovingFreeSectionDrag(client, {
        description: configuration.description,
        source,
        sourceSelector,
        target: attemptedTarget,
        captureFocus: configuration.verifyFocusContext && focusCapture === null,
        onCaptureFocus: (capture) => {
          focusCapture = capture;
        },
      });
      return focusCapture;
    },
  });
}

export async function visibleLeadingSortableSectionPoint(
  client,
  targetSortableSelector,
  description,
  targetYFraction,
) {
  if (!(targetYFraction > 0 && targetYFraction < 0.5)) {
    throw new Error(
      `${description} targetYFraction must be within the leading vertical half.`,
    );
  }
  const result = await evaluate(
    client,
    `(() => {
      const target = document.querySelector(${JSON.stringify(targetSortableSelector)});
      if (!(target instanceof HTMLElement)) {
        return { point: null, reason: "missing sortable target" };
      }
      const rect = target.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        return { point: null, reason: "sortable target outside viewport", rect: rect.toJSON() };
      }
      const yFractions = Array.from(
        new Set([${JSON.stringify(targetYFraction)}, 0.25, 0.125, 0.375]),
      ).filter((fraction) => fraction > 0 && fraction < 0.5);
      const xFractions = [0.5, 0.4, 0.6];
      const blockedHits = [];
      // This locates a drop collision rather than a drag activator: controls and resize chrome
      // remain valid when they belong to the sortable target itself.
      for (const yFraction of yFractions) {
        for (const xFraction of xFractions) {
          const point = {
            x: left + (right - left) * xFraction,
            y: top + (bottom - top) * yFraction,
          };
          const hit = document.elementFromPoint(point.x, point.y);
          if (hit instanceof HTMLElement && target.contains(hit)) {
            return { point, reason: null };
          }
          if (blockedHits.length < 5) {
            blockedHits.push({
              className: hit instanceof HTMLElement ? hit.className : null,
              tagName: hit instanceof HTMLElement ? hit.tagName : null,
              xFraction,
              yFraction,
            });
          }
        }
      }
      return {
        blockedHits,
        point: null,
        reason: "no pointer-reachable leading sortable target point",
        rect: rect.toJSON(),
      };
    })()`,
  );
  if (result?.point === null || result?.point === undefined) {
    throw new Error(
      `${description} has no pointer-reachable leading sortable target point: ${JSON.stringify(result)}.`,
    );
  }
  return result.point;
}

export async function visibleCanvasDropPointForSection(
  client,
  sourceSelector,
  sourcePoint,
  description,
) {
  const result = await evaluate(
    client,
    `(() => {
      const pane = document.querySelector(${JSON.stringify(workspaceCanvasPaneSelector)});
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      if (!(pane instanceof HTMLElement) || !(source instanceof HTMLElement)) {
        return { point: null, reason: "missing source or workspace canvas" };
      }

      const paneRect = pane.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const visiblePane = {
        bottom: Math.min(window.innerHeight, paneRect.bottom),
        left: Math.max(0, paneRect.left),
        right: Math.min(window.innerWidth, paneRect.right),
        top: Math.max(0, paneRect.top),
      };
      if (
        sourceRect.width <= 0 ||
        sourceRect.height <= 0 ||
        visiblePane.right <= visiblePane.left ||
        visiblePane.bottom <= visiblePane.top
      ) {
        return { point: null, reason: "source or canvas has no visible geometry" };
      }

      const sourcePoint = ${JSON.stringify(sourcePoint)};
      const sourceOffset = {
        x: sourcePoint.x - sourceRect.left,
        y: sourcePoint.y - sourceRect.top,
      };
      const minimum = {
        x: Math.ceil(visiblePane.left + ${sectionCanvasDropMarginPx} + sourceOffset.x),
        y: Math.ceil(visiblePane.top + ${sectionCanvasDropMarginPx} + sourceOffset.y),
      };
      const maximum = {
        x: Math.floor(
          visiblePane.right -
            ${sectionCanvasDropMarginPx} -
            (sourceRect.width - sourceOffset.x),
        ),
        y: Math.floor(
          visiblePane.bottom -
            ${sectionCanvasDropMarginPx} -
            (sourceRect.height - sourceOffset.y),
        ),
      };
      if (minimum.x > maximum.x || minimum.y > maximum.y) {
        return {
          point: null,
          reason: "source cannot fit inside the visible canvas",
          maximum,
          minimum,
          sourceRect: sourceRect.toJSON(),
          visiblePane,
        };
      }

      const sourceSortable = source.closest("[data-sortable-section-id]");
      const collisionRects = Array.from(
        document.querySelectorAll("[data-section-id], [data-sortable-section-id]"),
      )
        .filter((element) => element instanceof HTMLElement)
        .filter(
          (element) =>
            element !== source &&
            element !== sourceSortable &&
            !source.contains(element) &&
            !(sourceSortable instanceof HTMLElement && sourceSortable.contains(element)),
        )
        .map((element) => ({
          id:
            element.getAttribute("data-section-id") ??
            element.getAttribute("data-sortable-section-id") ??
            "unknown",
          rect: element.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);

      function candidateAxis(min, max, fractions) {
        return [...new Set(
          fractions.map((fraction) =>
            Math.round(min + (max - min) * fraction),
          ),
        )];
      }

      function intersects(left, top, right, bottom, rect) {
        const clearance = ${sectionCanvasDropCollisionClearancePx};
        return (
          left < rect.right + clearance &&
          right > rect.left - clearance &&
          top < rect.bottom + clearance &&
          bottom > rect.top - clearance
        );
      }

      const xs = candidateAxis(minimum.x, maximum.x, [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0]);
      const ys = candidateAxis(minimum.y, maximum.y, [0.25, 0.5, 0.75, 0.125, 0.875, 0, 1]);
      for (const x of xs) {
        for (const y of ys) {
          const left = sourceRect.left + x - sourcePoint.x;
          const top = sourceRect.top + y - sourcePoint.y;
          const right = left + sourceRect.width;
          const bottom = top + sourceRect.height;
          if (
            left < visiblePane.left + ${sectionCanvasDropMarginPx} ||
            right > visiblePane.right - ${sectionCanvasDropMarginPx} ||
            top < visiblePane.top + ${sectionCanvasDropMarginPx} ||
            bottom > visiblePane.bottom - ${sectionCanvasDropMarginPx} ||
            collisionRects.some(({ rect }) => intersects(left, top, right, bottom, rect)) ||
            document.elementFromPoint(x, y) !== pane
          ) {
            continue;
          }
          return { point: { x, y } };
        }
      }

      return {
        point: null,
        collisionIds: collisionRects.map(({ id }) => id),
        maximum,
        minimum,
        reason: "no collision-clear exposed canvas target",
        sourceRect: sourceRect.toJSON(),
        visiblePane,
      };
    })()`,
  );
  if (result?.point === null || result?.point === undefined) {
    throw new Error(
      `${description} has no source-aware canvas drop point: ${JSON.stringify(result)}.`,
    );
  }
  return result.point;
}

export async function retrySectionMoveUntilObserved({
  description,
  describeFailure,
  hasMoved,
  observationPollIntervalMs = sectionMoveObservationPollIntervalMs,
  observationTimeoutMs = sectionMoveObservationTimeoutMs,
  performGesture,
}) {
  for (let attempt = 0; attempt < sectionMoveAttemptLimit; attempt += 1) {
    const result = await performGesture(attempt);
    if (
      await canonicalMoveObservedWithinWindow(
        hasMoved,
        observationTimeoutMs,
        observationPollIntervalMs,
      )
    ) {
      return result;
    }
  }

  const failureDetails = describeFailure ? await describeFailure() : null;
  throw new Error(
    `${description} did not produce its expected canonical move after ${sectionMoveAttemptLimit} completed moving-free drag attempts.${failureDetails === null ? "" : `\n${failureDetails}`}`,
  );
}

export async function describeSectionMoveFailure({
  backendOrigin,
  client,
  fetchSnapshot = fetchCanonicalSnapshot,
  sourceListId,
  sourceSelector,
  target,
}) {
  const snapshot = await fetchSnapshot(backendOrigin);
  const sourceList = snapshot.lists.find((list) => list.id === sourceListId);
  const dom = await evaluate(
    client,
    `(() => {
      function elementIdentity(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        return {
          ariaLabel: element.getAttribute("aria-label"),
          id: element.id || null,
          sectionId: element.getAttribute("data-section-id"),
          sortableSectionId: element.getAttribute("data-sortable-section-id"),
          tagName: element.tagName,
        };
      }

      function geometry(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      }

      function visibleText(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = (element.textContent ?? "").trim();
        if (
          text === "" ||
          rect.width <= 1 ||
          rect.height <= 1 ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          return null;
        }
        return text;
      }

      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      const list = document.querySelector(${JSON.stringify(listSectionSelector(sourceListId))});
      const listWrapper = list?.parentElement;
      const topLevelSectionIds = Array.from(
        document.querySelectorAll("[data-section-id]"),
      )
        .filter(
          (section) =>
            section instanceof HTMLElement &&
            section.closest("[data-sortable-section-id]") === null,
        )
        .map((section) => section.getAttribute("data-section-id"));
      const nestedSortableSectionIds =
        listWrapper instanceof HTMLElement
          ? Array.from(
              listWrapper.querySelectorAll(${JSON.stringify(listNestedSortableSectionSelector)}),
            ).map((section) => section.getAttribute("data-sortable-section-id"))
          : [];
      const visibleMutationErrorOrAlertTexts = Array.from(
        document.querySelectorAll("#python-canvas-mutation-error, [role=alert]"),
      ).flatMap((element) => {
        const text = visibleText(element);
        return text === null
          ? []
          : [
              {
                id: element.id || null,
                role: element.getAttribute("role"),
                text,
              },
            ];
      });
      const target = ${JSON.stringify(target)};
      const targetHit =
        target === null
          ? null
          : elementIdentity(document.elementFromPoint(target.x, target.y));
      return {
        nestedSortableSectionIds,
        source:
          source instanceof HTMLElement
            ? {
                ancestor: elementIdentity(source.parentElement),
                geometry: geometry(source),
                identity: elementIdentity(source),
              }
            : null,
        targetHit,
        topLevelSectionIds,
        visibleMutationErrorOrAlertTexts,
      };
    })()`,
  );

  return [
    `canonical top-level section IDs: ${JSON.stringify(snapshot.topLevelSectionIds)}`,
    `canonical source list ${JSON.stringify(sourceListId)} child section IDs: ${JSON.stringify(sourceList?.childSectionIds ?? null)}`,
    `DOM top-level section IDs: ${JSON.stringify(dom.topLevelSectionIds)}`,
    `DOM nested sortable section IDs under source list: ${JSON.stringify(dom.nestedSortableSectionIds)}`,
    `visible Python Canvas mutation error or alert text: ${JSON.stringify(dom.visibleMutationErrorOrAlertTexts)}`,
    `source current ancestor/geometry: ${JSON.stringify(dom.source)}`,
    `attempted target point: ${JSON.stringify(target)}`,
    `target elementFromPoint identity: ${JSON.stringify(dom.targetHit)}`,
  ].join("\n");
}

async function canonicalMoveObservedWithinWindow(
  hasMoved,
  timeoutMs,
  pollIntervalMs,
) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await hasMoved()) {
      return true;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return false;
    }
    await delay(Math.min(pollIntervalMs, remainingMs));
  }
}

export async function tryMovingFreeSectionDrag(client, configuration) {
  const modifiers = sectionDragModifiers();
  let mousePressed = false;
  let pointer = configuration.source;
  await holdMovingFreeSectionDragMode(client);
  try {
    await waitFor(
      client,
      `${configuration.description} mode activation`,
      sectionDragModeExpression(configuration.sourceSelector),
    );
    if (configuration.captureFocus) {
      configuration.onCaptureFocus(
        await captureFocusBeforeSectionMove(
          client,
          configuration.sourceSelector,
        ),
      );
    }
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      buttons: 0,
      modifiers,
      type: "mouseMoved",
    });
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
    });
    mousePressed = true;
    await (configuration.sleep ?? delay)(sectionDragPointerHoldMs);
    for (let step = 1; step <= sectionDragPointerMoveSteps; step += 1) {
      pointer = {
        x:
          configuration.source.x +
          ((configuration.target.x - configuration.source.x) * step) /
            sectionDragPointerMoveSteps,
        y:
          configuration.source.y +
          ((configuration.target.y - configuration.source.y) * step) /
            sectionDragPointerMoveSteps,
      };
      await client.send("Input.dispatchMouseEvent", {
        ...pointer,
        button: "left",
        buttons: 1,
        modifiers,
        type: "mouseMoved",
      });
    }
    await nextAnimationFrame(client);
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      button: "left",
      buttons: 0,
      modifiers,
      type: "mouseReleased",
    });
    mousePressed = false;
  } finally {
    if (mousePressed) {
      await client.send("Input.dispatchMouseEvent", {
        ...pointer,
        button: "left",
        buttons: 0,
        modifiers,
        type: "mouseReleased",
      });
    }
    await releaseMovingFreeSectionDragMode(client);
    await waitForSectionDragModeRelease(client, configuration.sourceSelector);
    await nextAnimationFrame(client);
  }
}

export async function sectionDragStartPoint(
  client,
  sourceSelector,
  description,
) {
  return visibleElementPoint(
    client,
    `${sourceSelector} header.section-title`,
    `${description} title header`,
  );
}

export async function holdMovingFreeSectionDragMode(client) {
  await client.send("Input.dispatchKeyEvent", {
    code: "AltLeft",
    key: "Alt",
    modifiers: 1,
    type: "keyDown",
  });
}

export async function releaseMovingFreeSectionDragMode(client) {
  await client.send("Input.dispatchKeyEvent", {
    code: "AltLeft",
    key: "Alt",
    modifiers: 0,
    type: "keyUp",
  });
}

function sectionDragModeExpression(sourceSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sourceSelector)});
    return section?.parentElement?.classList.contains("nodrag") === true;
  })()`;
}

export async function waitForSectionDragModeRelease(client, sourceSelector) {
  await waitFor(
    client,
    "the previous section drag mode to deactivate",
    sectionDragModeReleaseExpression(sourceSelector),
  );
}

function sectionDragModeReleaseExpression(sourceSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sourceSelector)});
    return section instanceof HTMLElement &&
      section.parentElement?.classList.contains("nodrag") !== true;
  })()`;
}

function sectionDragModifiers() {
  return 1;
}
