import type { KeyboardEvent, MouseEvent } from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { openWorkspaceSectionMenu } from "../../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
  shouldRetainNativeContextMenu,
} from "../../context-menu/workspaceMenuOwnership";
import type { WorkspaceHost } from "../../workspaceHost";
import { getOnSectionClick } from "../sectionClick";

export function getSectionContainerHandlers(
  host: WorkspaceHost,
  sectionId: string,
) {
  return {
    onClick: getOnSectionClick(host, sectionId),
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (
        event.target === event.currentTarget &&
        isWorkspaceMenuKeyboardEvent(event.nativeEvent)
      ) {
        event.preventDefault();
        event.stopPropagation();
        openWorkspaceSectionMenu(
          host,
          sectionId,
          "context-menu",
          getOwnerKeyboardMenuPoint(event.currentTarget),
          event.currentTarget,
        );
        return;
      }
      if (
        event.target === event.currentTarget &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        event.stopPropagation();
        applyActiveSectionChange(host, {
          interaction: "section-click",
          sectionId,
        });
      }
    },
    onContextMenu(event: MouseEvent<HTMLDivElement>) {
      if (shouldRetainNativeContextMenu(event.target, event.currentTarget)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceSectionMenu(
        host,
        sectionId,
        "context-menu",
        { x: event.clientX, y: event.clientY },
        event.currentTarget,
      );
    },
  };
}
