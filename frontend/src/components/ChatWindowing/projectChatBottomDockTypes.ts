import type {
  ChatWindowBounds,
  ChatWindowMode,
  ChatWindowPlacement,
} from "utils/generatedTypes";

export type ResolvedWindowPill = {
  instanceId: string;
  title: string;
  mode: ChatWindowMode;
  isClosed: boolean;
  isMinimized: boolean;
  placement: ChatWindowPlacement;
  zIndex: number;
  bounds: ChatWindowBounds;
  dockWidthFraction: number | null;
  dockPreferredWidthPx: number | null;
  sectionId: string | null;
  chatId: string | null;
};

export type PaneTrackedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ChatWindowExitAnimationKind = "minimize" | "close";
export type ChatWindowEnterAnimationKind = "restore_from_minimize";
