import { clearNodesSelectionBounds } from "gpuFlow/selectionBounds";
import { screenToFlowPosition } from "gpuFlow/viewportActions";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { openPaneContextMenu } from "state/actions/contextMenus";
import { addTemporaryNotification } from "state/actions/notifications";
import { openFileAsSectionForDrop } from "state/actions/sections/createSections";
import { useMisc } from "state/definitions";
import { getFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import { NotificationTypeEnum } from "utils/generatedTypes";
import { importNativeFileToWorkspace } from "utils/nativeFileImport";
import { isProjectPaneBackgroundTarget } from "./gpuProjectInteractionGuards";

export function handleProjectPaneClick(event: ReactMouseEvent<HTMLDivElement>) {
  if (!isProjectPaneBackgroundTarget(event.target)) {
    return;
  }
  if (useMisc.getState().mouseDownDrawArea) {
    useMisc.setState({ mouseDownDrawArea: false });
    return;
  }
  if (gpuFlowViewportStore.getState().userSelectionActive) {
    return;
  }
  applyActiveSectionChange({ interaction: "pane-click" });
  useMisc.setState({
    lastPaneClickLocation: screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    }),
  });
  clearNodesSelectionBounds();
}

export function handleProjectPaneContextMenu(
  panOnDrag: boolean | readonly number[],
) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isProjectPaneBackgroundTarget(event.target)) {
      return;
    }
    if (Array.isArray(panOnDrag) && panOnDrag.includes(2)) {
      event.preventDefault();
      return;
    }
    openPaneContextMenu(event);
  };
}

export function handleProjectPaneDragOver(
  event: ReactDragEvent<HTMLDivElement>,
) {
  if (!isProjectPaneBackgroundTarget(event.target)) {
    return;
  }
  const payload = getFileBrowserDragPayload(event.dataTransfer);
  const hasNativeFiles = event.dataTransfer.files.length > 0;
  if ((!payload || payload.type !== "file") && !hasNativeFiles) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

export function handleProjectPaneDrop(event: ReactDragEvent<HTMLDivElement>) {
  if (!isProjectPaneBackgroundTarget(event.target)) {
    return;
  }
  const position = screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  const payload = getFileBrowserDragPayload(event.dataTransfer);
  const openFileForDrop = async (filePath: string, fileName: string) => {
    const result = await openFileAsSectionForDrop({
      fileName,
      filePath,
      focusOnSection: false,
      position,
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
      addTemporaryNotification(importResult.error, NotificationTypeEnum.error);
      return;
    }
    await openFileForDrop(importResult.filePath, importResult.fileName);
  };
  void openNativeFileDrop();
}
