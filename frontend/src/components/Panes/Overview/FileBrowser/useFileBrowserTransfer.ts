import {
  transferFileBrowserEntry,
  type FilebrowserTransferResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback, useRef, type MutableRefObject } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "utils/fileBrowserPathRelation";
import { NotificationTypeEnum } from "utils/generatedTypes";
import {
  shouldRefreshMovedExpandedFolder,
  shouldRefreshRootAfterFileBrowserTransfer,
  shouldSkipFileBrowserTransfer,
} from "./fileBrowserPaneCore";
import type {
  FileBrowserClipboardEntry,
  FileNode,
  NodeKind,
} from "./fileBrowserPaneShared";

type TransferFileBrowserEntryRouteResponse =
  ResponseDataAndStatus<FilebrowserTransferResponse>;

function resolveTransferContext(args: {
  sourcePath: string;
  destinationFolderPath: string;
  nodesByPathRef: MutableRefObject<Record<string, FileNode>>;
}) {
  const normalizedSourcePath = normalizeFileBrowserPathForComparison(
    args.sourcePath,
  );
  const normalizedDestinationFolderPath = normalizeFileBrowserPathForComparison(
    args.destinationFolderPath,
  );
  if (!normalizedSourcePath || !normalizedDestinationFolderPath) {
    return null;
  }
  return {
    normalizedSourcePath,
    normalizedDestinationFolderPath,
    sourceParentPath:
      args.nodesByPathRef.current[normalizedSourcePath]?.parentPath ?? null,
  };
}

function hasInvalidTransferDestination(args: {
  operation: "copy" | "move";
  sourceType: NodeKind;
  sourceParentPath: string | null;
  destinationFolderPath: string;
  normalizedSourcePath: string;
  normalizedDestinationFolderPath: string;
}): boolean {
  if (
    shouldSkipFileBrowserTransfer({
      operation: args.operation,
      sourceParentPath: args.sourceParentPath,
      destinationFolderPath: args.destinationFolderPath,
    })
  ) {
    return true;
  }
  if (
    args.sourceType !== "folder" ||
    !isSameOrDescendantBrowserPath(
      args.normalizedDestinationFolderPath,
      args.normalizedSourcePath,
    )
  ) {
    return false;
  }
  addTemporaryNotification(
    "Cannot move or copy a folder into itself.",
    NotificationTypeEnum.warning,
  );
  return true;
}

async function requestTransfer(args: {
  normalizedSourcePath: string;
  normalizedDestinationFolderPath: string;
  operation: "copy" | "move";
}): Promise<TransferFileBrowserEntryRouteResponse> {
  return (await callOpenAPI(
    transferFileBrowserEntry({
      body: {
        sourcePath: args.normalizedSourcePath,
        destinationFolderPath: args.normalizedDestinationFolderPath,
        operation: args.operation,
      },
    } as Parameters<typeof transferFileBrowserEntry>[0]),
  )) as TransferFileBrowserEntryRouteResponse;
}

function collectFoldersToRefresh(args: {
  sourceParentPath: string | null;
  destinationFolderPath: string;
  shouldRefreshMovedFolderContents: boolean;
  normalizedDestinationPath: string | null;
  rootPath: string | null;
  normalizedSourcePath: string;
  sourceType: NodeKind;
  expandedPaths: Record<string, boolean>;
}): Set<string> {
  const foldersToRefresh = new Set<string>();
  if (args.sourceParentPath) {
    foldersToRefresh.add(args.sourceParentPath);
  }
  foldersToRefresh.add(args.destinationFolderPath);
  if (args.shouldRefreshMovedFolderContents && args.normalizedDestinationPath) {
    foldersToRefresh.add(args.normalizedDestinationPath);
  }
  if (
    shouldRefreshRootAfterFileBrowserTransfer({
      rootPath: args.rootPath,
      sourceParentPath: args.sourceParentPath,
      destinationFolderPath: args.destinationFolderPath,
    }) &&
    args.rootPath
  ) {
    foldersToRefresh.add(args.rootPath);
  }
  return foldersToRefresh;
}

function applyPostMoveState(args: {
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  operation: "copy" | "move";
  sourceType: NodeKind;
  sourcePath: string;
  destinationPath: string;
}): void {
  args.fileBrowserState.setState((state) => {
    if (args.operation !== "move") {
      return { selectedPath: args.destinationPath };
    }
    const nextExpandedPaths = { ...state.expandedPaths };
    const normalizedPrefix = `${args.sourcePath}/`;
    const wasExpanded = shouldRefreshMovedExpandedFolder({
      operation: args.operation,
      sourceType: args.sourceType,
      sourcePath: args.sourcePath,
      destinationPath: args.destinationPath,
      expandedPaths: state.expandedPaths,
    });
    for (const key of Object.keys(nextExpandedPaths)) {
      const normalizedKey = normalizeFileBrowserPathForComparison(key);
      if (
        normalizedKey === args.sourcePath ||
        normalizedKey.startsWith(normalizedPrefix)
      ) {
        delete nextExpandedPaths[key];
      }
    }
    if (wasExpanded) {
      nextExpandedPaths[args.destinationPath] = true;
    }
    return {
      selectedPath: args.destinationPath,
      expandedPaths: nextExpandedPaths,
    };
  });
}

type UseFileBrowserTransferArgs = {
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  nodesByPathRef: MutableRefObject<Record<string, FileNode>>;
  rootPath: string | null;
  selectedPath: string | null;
  fetchFolderContents: (
    folderPath: string,
    ignoreOverride?: string[],
    rootRequestId?: number,
  ) => Promise<FileNode[] | null>;
};

export function useFileBrowserTransfer({
  fileBrowserState,
  nodesByPathRef,
  rootPath,
  selectedPath,
  fetchFolderContents,
}: UseFileBrowserTransferArgs) {
  const clipboardEntryRef = useRef<FileBrowserClipboardEntry | null>(null);

  const transferEntryToFolder = useCallback(
    async ({
      sourcePath,
      sourceType,
      destinationFolderPath,
      operation,
    }: {
      sourcePath: string;
      sourceType: NodeKind;
      destinationFolderPath: string;
      operation: "copy" | "move";
    }): Promise<string | null> => {
      const transferContext = resolveTransferContext({
        sourcePath,
        destinationFolderPath,
        nodesByPathRef,
      });
      if (!transferContext) {
        return null;
      }
      if (
        hasInvalidTransferDestination({
          operation,
          sourceType,
          sourceParentPath: transferContext.sourceParentPath,
          destinationFolderPath,
          normalizedSourcePath: transferContext.normalizedSourcePath,
          normalizedDestinationFolderPath:
            transferContext.normalizedDestinationFolderPath,
        })
      ) {
        return null;
      }
      const response = await requestTransfer({
        normalizedSourcePath: transferContext.normalizedSourcePath,
        normalizedDestinationFolderPath:
          transferContext.normalizedDestinationFolderPath,
        operation,
      });
      if (!res200(response)) {
        addTemporaryNotification(
          getErrorDetail(response.data) ??
            `Failed to ${operation === "move" ? "move" : "copy"} file browser entry.`,
          NotificationTypeEnum.error,
        );
        return null;
      }
      const destinationPath = response.data.destinationPath;
      const normalizedDestinationPath =
        normalizeFileBrowserPathForComparison(destinationPath);
      if (
        operation === "move" &&
        normalizedDestinationPath === transferContext.normalizedSourcePath
      ) {
        return null;
      }
      const expandedPaths = fileBrowserState.getState().expandedPaths;
      const shouldRefreshMovedFolderContents = shouldRefreshMovedExpandedFolder(
        {
          operation,
          sourceType,
          sourcePath: transferContext.normalizedSourcePath,
          destinationPath: normalizedDestinationPath,
          expandedPaths,
        },
      );
      const foldersToRefresh = collectFoldersToRefresh({
        sourceParentPath: transferContext.sourceParentPath,
        destinationFolderPath: transferContext.normalizedDestinationFolderPath,
        shouldRefreshMovedFolderContents,
        normalizedDestinationPath,
        rootPath,
        normalizedSourcePath: transferContext.normalizedSourcePath,
        sourceType,
        expandedPaths,
      });
      await Promise.all(
        Array.from(foldersToRefresh).map(async (folderPath) => {
          await fetchFolderContents(folderPath);
        }),
      );
      applyPostMoveState({
        fileBrowserState,
        operation,
        sourceType,
        sourcePath: transferContext.normalizedSourcePath,
        destinationPath,
      });
      return destinationPath;
    },
    [fetchFolderContents, fileBrowserState, nodesByPathRef, rootPath],
  );

  const handleDropIntoFolder = useCallback(
    (
      payload: { fullPath: string; type: NodeKind },
      destinationFolderPath: string,
    ) => {
      void transferEntryToFolder({
        sourcePath: payload.fullPath,
        sourceType: payload.type,
        destinationFolderPath,
        operation: "move",
      });
    },
    [transferEntryToFolder],
  );

  const handlePasteClipboard = useCallback(() => {
    const activeClipboardEntry = clipboardEntryRef.current;
    if (!activeClipboardEntry) {
      return;
    }
    const selectedNode = selectedPath
      ? nodesByPathRef.current[selectedPath]
      : null;
    const destinationFolderPath =
      selectedNode?.type === "folder"
        ? selectedNode.fullPath
        : selectedNode?.parentPath ?? rootPath;
    if (!destinationFolderPath) {
      return;
    }
    void transferEntryToFolder({
      sourcePath: activeClipboardEntry.sourcePath,
      sourceType: activeClipboardEntry.sourceType,
      destinationFolderPath,
      operation: activeClipboardEntry.operation,
    }).then((destinationPath) => {
      if (destinationPath && activeClipboardEntry.operation === "move") {
        clipboardEntryRef.current = null;
      }
    });
  }, [nodesByPathRef, rootPath, selectedPath, transferEntryToFolder]);

  return {
    clipboardEntryRef,
    handleDropIntoFolder,
    handlePasteClipboard,
  };
}
