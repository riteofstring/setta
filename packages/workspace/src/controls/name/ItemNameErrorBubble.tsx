import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getElementTextDirection } from "../../styles/textDirection.js";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import { getWorkspaceSectionResizableId } from "../../section/sectionDomIds.js";

type BubblePosition = {
  top: number;
  left: number;
  visible: boolean;
};

const hiddenBubblePosition: BubblePosition = {
  top: 0,
  left: 0,
  visible: false,
};

function getBubbleScale(offsetSize: number, rectSize: number): number {
  if (offsetSize <= 0) {
    return 1;
  }
  return rectSize / offsetSize;
}

function clampBubbleLeft(
  nextLeft: number,
  maxLeft: number,
  margin: number,
): number {
  if (nextLeft > maxLeft) {
    return Math.max(margin, maxLeft);
  }
  if (nextLeft < margin) {
    return margin;
  }
  return nextLeft;
}

export function computeItemNameErrorBubblePosition(
  containerId: string,
  liveEditorId: string,
  dummyEditorId: string,
  bubbleElement: HTMLDivElement | null,
): BubblePosition | null {
  const anchorElement =
    document.getElementById(liveEditorId) ??
    document.getElementById(dummyEditorId);
  const containerElement = document.getElementById(containerId);
  if (!anchorElement || !bubbleElement || !containerElement) {
    return null;
  }
  const anchorRect = anchorElement.getBoundingClientRect();
  const bubbleRect = bubbleElement.getBoundingClientRect();
  const containerRect = containerElement.getBoundingClientRect();
  const scaleX = getBubbleScale(
    containerElement.offsetWidth,
    containerRect.width,
  );
  const scaleY = getBubbleScale(
    containerElement.offsetHeight,
    containerRect.height,
  );
  const margin = 6;
  const localAnchorLeft = (anchorRect.left - containerRect.left) / scaleX;
  const localTop = (anchorRect.top - containerRect.top) / scaleY;
  const localAnchorHeight = anchorRect.height / scaleY;
  const localBubbleWidth = bubbleRect.width / scaleX;
  const localAnchorRight = (anchorRect.right - containerRect.left) / scaleX;
  const preferredLeft =
    getElementTextDirection(anchorElement) === "rtl"
      ? localAnchorRight - localBubbleWidth
      : localAnchorLeft;
  const maxLeft = containerElement.offsetWidth - localBubbleWidth - margin;
  return {
    top: localTop + localAnchorHeight + margin,
    left: clampBubbleLeft(preferredLeft, maxLeft, margin),
    visible: true,
  };
}

function useItemNameErrorBubblePosition(
  errorMessage: string,
  containerId: string,
  liveEditorId: string,
  dummyEditorId: string,
) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubblePosition, setBubblePosition] = useState(hiddenBubblePosition);
  const updateBubblePosition = useCallback(() => {
    if (!errorMessage) {
      return;
    }
    const nextPosition = computeItemNameErrorBubblePosition(
      containerId,
      liveEditorId,
      dummyEditorId,
      bubbleRef.current,
    );
    if (nextPosition) {
      setBubblePosition(nextPosition);
    }
  }, [containerId, dummyEditorId, errorMessage, liveEditorId]);

  useLayoutEffect(() => {
    updateBubblePosition();
  }, [updateBubblePosition]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
    window.addEventListener("scroll", updateBubblePosition, true);
    window.addEventListener("resize", updateBubblePosition);
    return () => {
      window.removeEventListener("scroll", updateBubblePosition, true);
      window.removeEventListener("resize", updateBubblePosition);
    };
  }, [errorMessage, updateBubblePosition]);

  return { bubblePosition, bubbleRef };
}

export function ItemNameErrorBubble({
  dummyEditorId,
  errorId,
  errorMessage,
  liveEditorId,
  sectionId,
}: {
  dummyEditorId: string;
  errorId: string;
  errorMessage: string;
  liveEditorId: string;
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const containerId = getWorkspaceSectionResizableId(host, sectionId);
  const { bubblePosition, bubbleRef } = useItemNameErrorBubblePosition(
    errorMessage,
    containerId,
    liveEditorId,
    dummyEditorId,
  );
  if (!errorMessage) {
    return null;
  }
  const portalTarget = document.getElementById(containerId) ?? document.body;
  return createPortal(
    <div
      id={errorId}
      ref={bubbleRef}
      className={`${workspaceScopeClassName} pointer-events-none absolute z-50 max-w-[220px] whitespace-pre-line rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium leading-snug text-red-700 shadow-sm dark:border-red-900 dark:bg-[#120000] dark:text-red-200`}
      style={{
        top: bubblePosition.top,
        left: bubblePosition.left,
        opacity: bubblePosition.visible ? 1 : 0,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-1 start-3 h-2 w-2 rotate-45 border-s border-t border-red-300 bg-red-50 dark:border-red-900 dark:bg-[#120000]"
      />
      {errorMessage}
    </div>,
    portalTarget,
  );
}
