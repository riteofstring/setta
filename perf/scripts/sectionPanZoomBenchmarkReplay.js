"use strict";

function sectionPanZoomBenchmarkReplay(rawConfig = {}) {
  const config = {
    sceneId: "settings",
    paneSelector: ".react-flow__pane",
    viewportSelector: ".react-flow__viewport",
    nodeSelector: ".react-flow__node",
    targetSectionPattern: "groupSectionDefault",
    gutterPx: 24,
    settleFrames: 10,
    phaseSettleFrames: 6,
    overviewSweepSlowFrameCount: 40,
    overviewSweepFastFrameCount: 16,
    closeSweepSlowFrameCount: 24,
    closeSweepFastFrameCount: 10,
    zoomSlowFrameCount: 18,
    zoomFastFrameCount: 8,
    resizeFrameCount: 12,
    resizeVisibleDeltaPx: 18,
    fitScaleMin: 0.02,
    fitScaleMax: 1,
    panSweepScaleMultiplier: 3,
    panSweepScaleMin: 0.18,
    panSweepScaleMax: 0.3,
    closePanScaleMultiplier: 10,
    closePanScaleMin: 0.45,
    closePanScaleMax: 1,
    detailZoomScaleMultiplier: 1.18,
    detailZoomScaleMinDelta: 0.08,
    detailZoomScaleMax: 1.25,
    closePanViewportFraction: 0.2,
    closePanTargetMultiplier: 1.1,
    markPrefix: "section-benchmark",
    includeResizePhase: false,
    ...rawConfig,
  };

  const pane = document.querySelector(config.paneSelector);
  const viewport = document.querySelector(config.viewportSelector);
  if (!(pane instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
    throw new Error("Missing React Flow pane or viewport.");
  }

  const paneRect = pane.getBoundingClientRect();
  if (paneRect.width <= 0 || paneRect.height <= 0) {
    throw new Error("React Flow pane has invalid geometry.");
  }

  const raf = () =>
    new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  const waitFrames = async (count) => {
    for (let frame = 0; frame < count; frame += 1) {
      await raf();
    }
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const parseTransform = () => {
    const transform = window.getComputedStyle(viewport).transform;
    if (!transform || transform === "none") {
      return { tx: 0, ty: 0, scale: 1 };
    }
    const matrix = new DOMMatrixReadOnly(transform);
    const scale = Number.isFinite(matrix.a) && matrix.a > 0 ? matrix.a : 1;
    return { tx: matrix.e, ty: matrix.f, scale };
  };

  const applyTransform = (transform) => {
    viewport.style.transform =
      `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`;
  };

  const getVisibleNodes = () =>
    Array.from(document.querySelectorAll(config.nodeSelector)).filter(
      (node) =>
        node instanceof HTMLElement &&
        node.getBoundingClientRect().width > 0 &&
        node.getBoundingClientRect().height > 0,
    );

  const screenRectToWorldRect = (rect, transform) => ({
    minX: (rect.left - paneRect.left - transform.tx) / transform.scale,
    maxX: (rect.right - paneRect.left - transform.tx) / transform.scale,
    minY: (rect.top - paneRect.top - transform.ty) / transform.scale,
    maxY: (rect.bottom - paneRect.top - transform.ty) / transform.scale,
  });

  const worldRectToSerializable = (rect) => ({
    minX: Number(rect.minX.toFixed(3)),
    maxX: Number(rect.maxX.toFixed(3)),
    minY: Number(rect.minY.toFixed(3)),
    maxY: Number(rect.maxY.toFixed(3)),
    width: Number((rect.maxX - rect.minX).toFixed(3)),
    height: Number((rect.maxY - rect.minY).toFixed(3)),
    centerX: Number(((rect.minX + rect.maxX) / 2).toFixed(3)),
    centerY: Number(((rect.minY + rect.maxY) / 2).toFixed(3)),
  });

  const getProjectWorldBounds = () => {
    const transform = parseTransform();
    const nodes = getVisibleNodes();
    if (!nodes.length) {
      throw new Error("No visible React Flow nodes were found.");
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const worldRect = screenRectToWorldRect(
        node.getBoundingClientRect(),
        transform,
      );
      minX = Math.min(minX, worldRect.minX);
      minY = Math.min(minY, worldRect.minY);
      maxX = Math.max(maxX, worldRect.maxX);
      maxY = Math.max(maxY, worldRect.maxY);
    }
    return { minX, minY, maxX, maxY };
  };

  const getTargetNode = () => {
    const targetPattern = new RegExp(config.targetSectionPattern, "i");
    const nodes = getVisibleNodes();
    for (const node of nodes) {
      const text = node.textContent || "";
      const dataId = node.getAttribute("data-id") || "";
      const sectionId = node.getAttribute("data-section-id") || "";
      if (
        targetPattern.test(text) ||
        targetPattern.test(dataId) ||
        targetPattern.test(sectionId) ||
        targetPattern.test(node.id || "")
      ) {
        return node;
      }
    }
    throw new Error(
      `Unable to find target node matching ${config.targetSectionPattern}.`,
    );
  };

  const getTargetWorldRect = () => {
    const transform = parseTransform();
    return screenRectToWorldRect(
      getTargetNode().getBoundingClientRect(),
      transform,
    );
  };

  const buildFitTransform = (bounds) => {
    const innerWidth = Math.max(1, paneRect.width - config.gutterPx * 2);
    const innerHeight = Math.max(1, paneRect.height - config.gutterPx * 2);
    const projectWidth = Math.max(1, bounds.maxX - bounds.minX);
    const projectHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = clamp(
      Math.min(innerWidth / projectWidth, innerHeight / projectHeight),
      config.fitScaleMin,
      config.fitScaleMax,
    );
    const leftoverX = innerWidth - projectWidth * scale;
    const leftoverY = innerHeight - projectHeight * scale;
    return {
      tx: config.gutterPx + leftoverX / 2 - bounds.minX * scale,
      ty: config.gutterPx + leftoverY / 2 - bounds.minY * scale,
      scale,
    };
  };

  const centerWorldPoint = (worldPoint, scale) => ({
    tx: paneRect.width / 2 - worldPoint.x * scale,
    ty: paneRect.height / 2 - worldPoint.y * scale,
    scale,
  });

  const animateTransforms = async (fromTransform, toTransform, frameCount) => {
    const count = Math.max(1, frameCount);
    for (let frame = 1; frame <= count; frame += 1) {
      const progress = frame / count;
      applyTransform({
        tx: fromTransform.tx + (toTransform.tx - fromTransform.tx) * progress,
        ty: fromTransform.ty + (toTransform.ty - fromTransform.ty) * progress,
        scale:
          fromTransform.scale +
          (toTransform.scale - fromTransform.scale) * progress,
      });
      await waitFrames(1);
    }
  };

  const firePointer = (target, type, clientX, clientY) => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX,
        clientY,
      }),
    );
    target.dispatchEvent(
      new MouseEvent(type.replace("pointer", "mouse"), {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX,
        clientY,
      }),
    );
  };

  const dragResizeHandle = async (syntheticDeltaPx) => {
    const handle = getTargetNode().querySelector(".section-resize-handle-right");
    if (!(handle instanceof HTMLElement)) {
      throw new Error("Missing right resize handle on the target node.");
    }
    const handleRect = handle.getBoundingClientRect();
    const startX = handleRect.left + handleRect.width / 2;
    const startY = handleRect.top + handleRect.height / 2;
    firePointer(handle, "pointerdown", startX, startY);
    await waitFrames(1);
    for (let frame = 1; frame <= config.resizeFrameCount; frame += 1) {
      const clientX =
        startX + (syntheticDeltaPx * frame) / config.resizeFrameCount;
      firePointer(window, "pointermove", clientX, startY);
      firePointer(document, "pointermove", clientX, startY);
      firePointer(document.documentElement, "pointermove", clientX, startY);
      await waitFrames(1);
    }
    const endX = startX + syntheticDeltaPx;
    firePointer(window, "pointerup", endX, startY);
    firePointer(document, "pointerup", endX, startY);
    firePointer(document.documentElement, "pointerup", endX, startY);
    await waitFrames(config.phaseSettleFrames);
  };

  const calibrateResizeDelta = async () => {
    const beforeWidth = getTargetNode().getBoundingClientRect().width;
    let syntheticDeltaPx = config.resizeVisibleDeltaPx;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await dragResizeHandle(syntheticDeltaPx);
      const afterWidth = getTargetNode().getBoundingClientRect().width;
      const visibleDeltaPx = afterWidth - beforeWidth;
      if (visibleDeltaPx >= config.resizeVisibleDeltaPx * 0.9) {
        return {
          syntheticDeltaPx,
          visibleDeltaPx,
          beforeWidth,
          afterWidth,
        };
      }
      await dragResizeHandle(-syntheticDeltaPx);
      if (Math.abs(visibleDeltaPx) < 0.5) {
        syntheticDeltaPx *= 4;
      } else {
        syntheticDeltaPx *= config.resizeVisibleDeltaPx / visibleDeltaPx;
      }
    }
    await dragResizeHandle(syntheticDeltaPx);
    const afterWidth = getTargetNode().getBoundingClientRect().width;
    return {
      syntheticDeltaPx,
      visibleDeltaPx: afterWidth - beforeWidth,
      beforeWidth,
      afterWidth,
    };
  };

  const mark = (suffix) => performance.mark(`${config.markPrefix}-${suffix}`);

  const projectBounds = getProjectWorldBounds();
  const targetBounds = getTargetWorldRect();
  const fitTransform = buildFitTransform(projectBounds);
  const targetWorldCenter = {
    x: (targetBounds.minX + targetBounds.maxX) / 2,
    y: (targetBounds.minY + targetBounds.maxY) / 2,
  };
  const projectWorldCenter = {
    x: (projectBounds.minX + projectBounds.maxX) / 2,
    y: (projectBounds.minY + projectBounds.maxY) / 2,
  };
  const panSweepScale = clamp(
    Math.max(
      fitTransform.scale * config.panSweepScaleMultiplier,
      config.panSweepScaleMin,
    ),
    fitTransform.scale,
    config.panSweepScaleMax,
  );
  const panBaseTransform = centerWorldPoint(projectWorldCenter, panSweepScale);

  const horizontalStartTransform = {
    tx: config.gutterPx - projectBounds.minX * panSweepScale,
    ty: panBaseTransform.ty,
    scale: panSweepScale,
  };
  const horizontalEndTransform = {
    tx:
      paneRect.width -
      config.gutterPx -
      projectBounds.maxX * panSweepScale,
    ty: panBaseTransform.ty,
    scale: panSweepScale,
  };
  const verticalStartTransform = {
    tx: panBaseTransform.tx,
    ty: config.gutterPx - projectBounds.minY * panSweepScale,
    scale: panSweepScale,
  };
  const verticalEndTransform = {
    tx: panBaseTransform.tx,
    ty:
      paneRect.height -
      config.gutterPx -
      projectBounds.maxY * panSweepScale,
    scale: panSweepScale,
  };

  const closePanScale = clamp(
    fitTransform.scale * config.closePanScaleMultiplier,
    config.closePanScaleMin,
    config.closePanScaleMax,
  );
  const detailZoomScale = clamp(
    Math.max(
      closePanScale * config.detailZoomScaleMultiplier,
      closePanScale + config.detailZoomScaleMinDelta,
    ),
    closePanScale,
    config.detailZoomScaleMax,
  );
  const closePanBaseTransform = centerWorldPoint(targetWorldCenter, closePanScale);
  const detailZoomTransform = centerWorldPoint(
    targetWorldCenter,
    detailZoomScale,
  );
  const fitCenteredOnTargetTransform = centerWorldPoint(
    targetWorldCenter,
    fitTransform.scale,
  );

  const paneWorldWidthAtCloseScale = paneRect.width / closePanScale;
  const paneWorldHeightAtCloseScale = paneRect.height / closePanScale;
  const targetWidth = Math.max(1, targetBounds.maxX - targetBounds.minX);
  const targetHeight = Math.max(1, targetBounds.maxY - targetBounds.minY);
  const closePanOffsetX = Math.max(
    0,
    Math.min(
      Math.max(
        targetWidth * config.closePanTargetMultiplier,
        paneWorldWidthAtCloseScale * config.closePanViewportFraction,
      ),
      Math.max(
        0,
        targetWorldCenter.x -
          projectBounds.minX -
          paneWorldWidthAtCloseScale / 2,
      ),
      Math.max(
        0,
        projectBounds.maxX -
          targetWorldCenter.x -
          paneWorldWidthAtCloseScale / 2,
      ),
    ),
  );
  const closePanOffsetY = Math.max(
    0,
    Math.min(
      Math.max(
        targetHeight * config.closePanTargetMultiplier,
        paneWorldHeightAtCloseScale * config.closePanViewportFraction,
      ),
      Math.max(
        0,
        targetWorldCenter.y -
          projectBounds.minY -
          paneWorldHeightAtCloseScale / 2,
      ),
      Math.max(
        0,
        projectBounds.maxY -
          targetWorldCenter.y -
          paneWorldHeightAtCloseScale / 2,
      ),
    ),
  );
  const closeHorizontalStartTransform = centerWorldPoint(
    { x: targetWorldCenter.x - closePanOffsetX, y: targetWorldCenter.y },
    closePanScale,
  );
  const closeHorizontalEndTransform = centerWorldPoint(
    { x: targetWorldCenter.x + closePanOffsetX, y: targetWorldCenter.y },
    closePanScale,
  );
  const closeVerticalStartTransform = centerWorldPoint(
    { x: targetWorldCenter.x, y: targetWorldCenter.y - closePanOffsetY },
    closePanScale,
  );
  const closeVerticalEndTransform = centerWorldPoint(
    { x: targetWorldCenter.x, y: targetWorldCenter.y + closePanOffsetY },
    closePanScale,
  );

  const runMarkedPhase = async (phaseName, callback) => {
    mark(`${phaseName}-start`);
    await callback();
    mark(`${phaseName}-end`);
    await waitFrames(config.phaseSettleFrames);
  };

  const runPanPhase = async (phaseName, baseTransform, startTransform, endTransform, frameCount) => {
    await animateTransforms(fitTransform, baseTransform, config.phaseSettleFrames);
    await waitFrames(config.phaseSettleFrames);
    await runMarkedPhase(phaseName, async () => {
      await animateTransforms(baseTransform, startTransform, frameCount);
      await animateTransforms(startTransform, endTransform, frameCount);
      await animateTransforms(endTransform, baseTransform, frameCount);
    });
    await animateTransforms(baseTransform, fitTransform, config.phaseSettleFrames);
    await waitFrames(config.phaseSettleFrames);
  };

  const runZoomPhase = async (phaseName, frameCount, fromTransform, midTransform, toTransform) => {
    await animateTransforms(fitTransform, fromTransform, config.phaseSettleFrames);
    await waitFrames(config.phaseSettleFrames);
    await runMarkedPhase(phaseName, async () => {
      await animateTransforms(fromTransform, midTransform, frameCount);
      await animateTransforms(midTransform, toTransform, frameCount);
    });
    await animateTransforms(toTransform, fitTransform, config.phaseSettleFrames);
    await waitFrames(config.phaseSettleFrames);
  };

  applyTransform(fitTransform);

  return (async () => {
    await waitFrames(config.settleFrames);
    performance.clearMarks();

    mark("benchmark-start");

    await runPanPhase(
      "overview-horizontal-pan-slow",
      panBaseTransform,
      horizontalStartTransform,
      horizontalEndTransform,
      config.overviewSweepSlowFrameCount,
    );
    await runPanPhase(
      "overview-horizontal-pan-fast",
      panBaseTransform,
      horizontalStartTransform,
      horizontalEndTransform,
      config.overviewSweepFastFrameCount,
    );
    await runPanPhase(
      "overview-vertical-pan-slow",
      panBaseTransform,
      verticalStartTransform,
      verticalEndTransform,
      config.overviewSweepSlowFrameCount,
    );
    await runPanPhase(
      "overview-vertical-pan-fast",
      panBaseTransform,
      verticalStartTransform,
      verticalEndTransform,
      config.overviewSweepFastFrameCount,
    );
    await runPanPhase(
      "close-horizontal-pan-slow",
      closePanBaseTransform,
      closeHorizontalStartTransform,
      closeHorizontalEndTransform,
      config.closeSweepSlowFrameCount,
    );
    await runPanPhase(
      "close-horizontal-pan-fast",
      closePanBaseTransform,
      closeHorizontalStartTransform,
      closeHorizontalEndTransform,
      config.closeSweepFastFrameCount,
    );
    await runPanPhase(
      "close-vertical-pan-slow",
      closePanBaseTransform,
      closeVerticalStartTransform,
      closeVerticalEndTransform,
      config.closeSweepSlowFrameCount,
    );
    await runPanPhase(
      "close-vertical-pan-fast",
      closePanBaseTransform,
      closeVerticalStartTransform,
      closeVerticalEndTransform,
      config.closeSweepFastFrameCount,
    );
    await runZoomPhase(
      "overview-to-detail-zoom-slow",
      config.zoomSlowFrameCount,
      fitTransform,
      closePanBaseTransform,
      detailZoomTransform,
    );
    await runZoomPhase(
      "detail-to-overview-zoom-slow",
      config.zoomSlowFrameCount,
      detailZoomTransform,
      closePanBaseTransform,
      fitCenteredOnTargetTransform,
    );
    await runZoomPhase(
      "overview-to-detail-zoom-fast",
      config.zoomFastFrameCount,
      fitTransform,
      closePanBaseTransform,
      detailZoomTransform,
    );
    await runZoomPhase(
      "detail-to-overview-zoom-fast",
      config.zoomFastFrameCount,
      detailZoomTransform,
      closePanBaseTransform,
      fitCenteredOnTargetTransform,
    );

    let resizeCalibration = null;
    if (config.includeResizePhase) {
      await animateTransforms(
        fitTransform,
        fitCenteredOnTargetTransform,
        config.phaseSettleFrames,
      );
      await waitFrames(config.phaseSettleFrames);
      await runMarkedPhase("resize", async () => {
        resizeCalibration = await calibrateResizeDelta();
        await dragResizeHandle(-resizeCalibration.syntheticDeltaPx);
      });
      await animateTransforms(
        fitCenteredOnTargetTransform,
        fitTransform,
        config.phaseSettleFrames,
      );
      await waitFrames(config.phaseSettleFrames);
    }

    mark("benchmark-end");
    await waitFrames(config.phaseSettleFrames);

    return {
      sceneId: config.sceneId,
      pane: {
        width: Number(paneRect.width.toFixed(3)),
        height: Number(paneRect.height.toFixed(3)),
      },
      projectBounds: worldRectToSerializable(projectBounds),
      projectWorldCenter: {
        x: Number(projectWorldCenter.x.toFixed(3)),
        y: Number(projectWorldCenter.y.toFixed(3)),
      },
      targetBounds: worldRectToSerializable(targetBounds),
      targetDataId: getTargetNode().getAttribute("data-id"),
      transforms: {
        fit: fitTransform,
        panBase: panBaseTransform,
        horizontalStart: horizontalStartTransform,
        horizontalEnd: horizontalEndTransform,
        verticalStart: verticalStartTransform,
        verticalEnd: verticalEndTransform,
        closePanBase: closePanBaseTransform,
        closeHorizontalStart: closeHorizontalStartTransform,
        closeHorizontalEnd: closeHorizontalEndTransform,
        closeVerticalStart: closeVerticalStartTransform,
        closeVerticalEnd: closeVerticalEndTransform,
        detailZoom: detailZoomTransform,
      },
      resizeCalibration:
        resizeCalibration === null
          ? null
          : {
              ...resizeCalibration,
              syntheticDeltaPx: Number(
                resizeCalibration.syntheticDeltaPx.toFixed(3),
              ),
              visibleDeltaPx: Number(
                resizeCalibration.visibleDeltaPx.toFixed(3),
              ),
              beforeWidth: Number(resizeCalibration.beforeWidth.toFixed(3)),
              afterWidth: Number(resizeCalibration.afterWidth.toFixed(3)),
            },
      finalTransform: parseTransform(),
      marks: performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith(config.markPrefix))
        .map((entry) => entry.name),
    };
  })();
}

const SECTION_PAN_ZOOM_BENCHMARK_REPLAY =
  sectionPanZoomBenchmarkReplay.toString();

module.exports = {
  sectionPanZoomBenchmarkReplay,
  SECTION_PAN_ZOOM_BENCHMARK_REPLAY,
};

if (require.main === module) {
  process.stdout.write(SECTION_PAN_ZOOM_BENCHMARK_REPLAY);
}
