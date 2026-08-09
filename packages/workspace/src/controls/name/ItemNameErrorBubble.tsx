import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope";

// The reference `ParamNameInput` error bubble, positioned in the owning section's authored
// coordinate space so canvas zoom does not distort its offset. The package adds an id for the
// editor's `aria-describedby`; the persistent live region stays with the editor so assistive
// technology observes error text changing inside an already-mounted status node.

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

function clampBubbleLeft(nextLeft: number, maxLeft: number, margin: number): number {
  if (nextLeft > maxLeft) {
    return Math.max(margin, maxLeft);
  }
  if (nextLeft < margin) {
    return margin;
  }
  return nextLeft;
}

function computeBubblePosition(
  sectionId: string,
  liveEditorId: string,
  dummyEditorId: string,
  bubbleElement: HTMLDivElement | null,
): BubblePosition | null {
  const anchorElement =
    document.getElementById(liveEditorId) ?? document.getElementById(dummyEditorId);
  const containerElement = document.getElementById(`${sectionId}-CustomResizable`);
  if (!anchorElement || !bubbleElement || !containerElement) {
    return null;
  }
  const anchorRect = anchorElement.getBoundingClientRect();
  const bubbleRect = bubbleElement.getBoundingClientRect();
  const containerRect = containerElement.getBoundingClientRect();
  const scaleX = getBubbleScale(containerElement.offsetWidth, containerRect.width);
  const scaleY = getBubbleScale(containerElement.offsetHeight, containerRect.height);
  const margin = 6;
  const localLeft = (anchorRect.left - containerRect.left) / scaleX;
  const localTop = (anchorRect.top - containerRect.top) / scaleY;
  const localAnchorHeight = anchorRect.height / scaleY;
  const localBubbleWidth = bubbleRect.width / scaleX;
  const maxLeft = containerElement.offsetWidth - localBubbleWidth - margin;
  return {
    top: localTop + localAnchorHeight + margin,
    left: clampBubbleLeft(localLeft, maxLeft, margin),
    visible: true,
  };
}

function useItemNameErrorBubblePosition(
  errorMessage: string,
  sectionId: string,
  liveEditorId: string,
  dummyEditorId: string,
) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubblePosition, setBubblePosition] = useState(hiddenBubblePosition);
  const updateBubblePosition = useCallback(() => {
    if (!errorMessage) {
      return;
    }
    const nextPosition = computeBubblePosition(
      sectionId,
      liveEditorId,
      dummyEditorId,
      bubbleRef.current,
    );
    if (nextPosition) {
      setBubblePosition(nextPosition);
    }
  }, [dummyEditorId, errorMessage, liveEditorId, sectionId]);

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
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const { bubblePosition, bubbleRef } = useItemNameErrorBubblePosition(
    errorMessage,
    sectionId,
    liveEditorId,
    dummyEditorId,
  );
  if (!errorMessage) {
    return null;
  }
  const portalTarget = document.getElementById(`${sectionId}-CustomResizable`) ?? document.body;
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
        className="absolute -top-1 left-3 h-2 w-2 rotate-45 border-l border-t border-red-300 bg-red-50 dark:border-red-900 dark:bg-[#120000]"
      />
      {errorMessage}
    </div>,
    portalTarget,
  );
}
