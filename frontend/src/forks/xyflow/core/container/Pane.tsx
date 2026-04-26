import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { getNodesInside } from "forks/xyflow/core/utils/graph";
import {
  clearNodesSelectionBounds,
  updateActiveNodesSelectionBounds,
} from "gpuFlow/selectionBounds";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import React, {
  memo,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useRef,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  type SetActiveSectionIdsOptions,
  setActiveSectionIds,
} from "state/actions/activeSections";
import { openPaneContextMenu } from "state/actions/contextMenus";
import { addTemporaryNotification } from "state/actions/notifications";
import { openFileAsSectionForDrop } from "state/actions/sections/createSections";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useMisc, useSettings } from "state/definitions";
import { getFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import { NotificationTypeEnum, SelectionModeEnum } from "utils/generatedTypes";
import { importNativeFileToWorkspace } from "utils/nativeFileImport";
import UserSelection from "../components/UserSelection";
import { containerStyle } from "../styles";
import { getEventPosition } from "../utils";

type PaneProps = {
  isSelecting: boolean;
  children: ReactNode;
  panOnDrag: boolean | number[];
};

const wrapHandler = (
  handler: React.MouseEventHandler | undefined,
  containerRef: React.MutableRefObject<HTMLDivElement | null>,
): React.MouseEventHandler => {
  return (event: ReactMouseEvent) => {
    if (event.target !== containerRef.current) {
      return;
    }
    handler?.(event);
  };
};

const Pane = memo(({ isSelecting, panOnDrag, children }: PaneProps) => {
  const container = useRef<HTMLDivElement | null>(null);
  const prevSelectedNodesCount = useRef<number>(0);
  const containerBounds = useRef<DOMRect>();
  const userSelectionActive = useGpuFlowViewportStore(
    (state) => state.userSelectionActive,
  );

  const syncSelectionRectActiveIds = () => {
    setActiveSectionIds(getActiveSectionUIIds(), {
      forceDurableSync: true,
    });
  };

  const resetUserSelection = () => {
    gpuFlowViewportStore.getState().resetUserSelection();

    prevSelectedNodesCount.current = 0;
  };

  const onClick = (
    event: ReactMouseEvent,
    options?: SetActiveSectionIdsOptions,
  ) => {
    if (useMisc.getState().mouseDownDrawArea) {
      useMisc.setState({ mouseDownDrawArea: false });
      return;
    }
    applyActiveSectionChange({ interaction: "pane-click" }, options);
    useMisc.setState({
      lastPaneClickLocation: screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    });
    clearNodesSelectionBounds();
  };

  const onContextMenu = (event: ReactMouseEvent) => {
    if (Array.isArray(panOnDrag) && panOnDrag?.includes(2)) {
      event.preventDefault();
      return;
    }
    openPaneContextMenu(event);
  };

  const onMouseDown = (event: ReactMouseEvent): void => {
    const { domNode } = gpuFlowViewportStore.getState();
    containerBounds.current = domNode?.getBoundingClientRect();

    if (
      !isSelecting ||
      event.button !== 0 ||
      event.target !== container.current ||
      !containerBounds.current
    ) {
      return;
    }

    const { x, y } = getEventPosition(event, containerBounds.current);

    applyActiveSectionChange(
      {
        interaction: "selection-rect",
        selectedIds: [],
      },
      { syncMode: "ui-only" },
    );

    gpuFlowViewportStore.getState().setUserSelection({
      active: false,
      rect: {
        width: 0,
        height: 0,
        startX: x,
        startY: y,
        x,
        y,
      },
    });
  };

  const onMouseMove = (event: ReactMouseEvent): void => {
    const { userSelectionRect, transform } = gpuFlowViewportStore.getState();
    if (!isSelecting || !containerBounds.current || !userSelectionRect) {
      return;
    }

    clearNodesSelectionBounds();

    const mousePos = getEventPosition(event, containerBounds.current);
    const startX = userSelectionRect.startX ?? 0;
    const startY = userSelectionRect.startY ?? 0;

    const nextUserSelectRect = {
      ...userSelectionRect,
      x: mousePos.x < startX ? mousePos.x : startX,
      y: mousePos.y < startY ? mousePos.y : startY,
      width: Math.abs(mousePos.x - startX),
      height: Math.abs(mousePos.y - startY),
    };

    const selectedNodeIds = getNodesInside(
      nextUserSelectRect,
      [transform[0], transform[1], transform[2]],
      useSettings.getState().gui.selectionMode === SelectionModeEnum.partial,
    );

    if (prevSelectedNodesCount.current !== selectedNodeIds.length) {
      prevSelectedNodesCount.current = selectedNodeIds.length;
      applyActiveSectionChange(
        {
          interaction: "selection-rect",
          selectedIds: selectedNodeIds,
        },
        { syncMode: "ui-only" },
      );
    }

    gpuFlowViewportStore.getState().setUserSelection({
      active: true,
      rect: nextUserSelectRect,
    });
  };

  const onMouseUp = (event: ReactMouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    const { userSelectionRect } = gpuFlowViewportStore.getState();
    // We only want to trigger click functions when in selection mode if
    // the user did not move the mouse.
    if (
      !userSelectionActive &&
      userSelectionRect &&
      event.target === container.current
    ) {
      onClick(event, { forceDurableSync: true });
    }

    if (prevSelectedNodesCount.current > 0) {
      updateActiveNodesSelectionBounds();
    }
    if (userSelectionActive) {
      syncSelectionRectActiveIds();
    }
    resetUserSelection();
  };

  const onMouseLeave = () => {
    const { userSelectionRect } = gpuFlowViewportStore.getState();
    if (userSelectionRect) {
      if (userSelectionActive) {
        updateActiveNodesSelectionBounds();
      }
      syncSelectionRectActiveIds();
    }
    resetUserSelection();
  };

  const onDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.target !== container.current) {
      return;
    }
    const payload = getFileBrowserDragPayload(event.dataTransfer);
    const hasNativeFiles = event.dataTransfer.files.length > 0;
    if ((!payload || payload.type !== "file") && !hasNativeFiles) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.target !== container.current) {
      return;
    }
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const payload = getFileBrowserDragPayload(event.dataTransfer);
    const openFileForDrop = async (filePath: string, fileName: string) => {
      const result = await openFileAsSectionForDrop({
        filePath,
        fileName,
        position,
        focusOnSection: false,
      });
      if (result.status === "unsupported_binary") {
        addTemporaryNotification(
          "Binary files cannot be auto-opened as sections from drag-and-drop.",
          NotificationTypeEnum.warning,
        );
        return;
      }
      if (result.status === "failed") {
        addTemporaryNotification(
          "Failed to create a section from the dropped file.",
          NotificationTypeEnum.error,
        );
      }
    };
    if (payload && payload.type === "file") {
      event.preventDefault();
      void openFileForDrop(payload.fullPath, payload.name);
      return;
    }
    const nativeFile = event.dataTransfer.files.item(0);
    if (!nativeFile) {
      return;
    }
    event.preventDefault();
    const openNativeFileDrop = async () => {
      const importResult = await importNativeFileToWorkspace(nativeFile);
      if (importResult.status !== "ok") {
        addTemporaryNotification(
          importResult.error,
          NotificationTypeEnum.error,
        );
        return;
      }
      await openFileForDrop(importResult.filePath, importResult.fileName);
    };
    void openNativeFileDrop();
  };

  const hasActiveSelection = isSelecting || userSelectionActive;

  return (
    <div
      className="react-flow__pane"
      onClick={hasActiveSelection ? undefined : wrapHandler(onClick, container)}
      onContextMenu={wrapHandler(onContextMenu, container)}
      onMouseDown={hasActiveSelection ? onMouseDown : undefined}
      onMouseMove={hasActiveSelection ? onMouseMove : undefined}
      onMouseUp={hasActiveSelection ? onMouseUp : undefined}
      onMouseLeave={hasActiveSelection ? onMouseLeave : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      ref={container}
      style={containerStyle}
    >
      {children}
      <UserSelection />
    </div>
  );
});

Pane.displayName = "Pane";

export default Pane;
