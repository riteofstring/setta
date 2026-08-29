import * as Popover from "@radix-ui/react-popover";
import { useEffect, useLayoutEffect, useRef } from "react";
import { getReactFlowStore } from "../../canvas/store";
import type { WorkspaceTextDirection } from "../../styles/textDirection";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { registerWorkspaceHostElement } from "../../workspaceHostInternals";

// The reference's `StandardPopover` atom trimmed to the built-in controls' usage: a controlled
// Radix popover portaled to the document body with the reference's default arrow paint. The
// reference's optional close button, portal-container override, and uncontrolled-open fallback
// have no control-slice caller and stay behind. Canvas repositioning is always on — every
// control popover opens from a section on the pan/zoom surface, which is exactly the case the
// reference flags with `repositionOnCanvasTransform`.

const ARROW_CLASS_NAME =
  "[fill:rgb(229,_231,_235)] dark:[fill:rgb(51,_65,_85)]";

// The canvas pans and zooms via CSS transforms, so Radix popovers portaled to document.body
// need an explicit reposition signal to stay attached. One frame-coalesced synthetic
// scroll/resize pair per transform change, exactly as the reference dispatches it.
function useRepositionOnCanvasTransform(open: boolean) {
  const host = useWorkspaceHost();
  useEffect(() => {
    if (!open) {
      return;
    }
    let rafId: number | null = null;
    const scheduleReposition = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
      });
    };
    scheduleReposition();
    const unsubscribe = getReactFlowStore(host).subscribe(
      (state) => state.transform,
      () => scheduleReposition(),
    );
    return () => {
      unsubscribe();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [host, open]);
}

export function ControlPopover({
  trigger,
  contentClasses,
  contentProps,
  children,
  open,
  onOpenChange,
  direction,
}: {
  trigger: React.ReactElement;
  contentClasses: string;
  contentProps: Omit<Popover.PopoverContentProps, "children" | "className">;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (newOpen: boolean) => void;
  direction: WorkspaceTextDirection;
}) {
  const host = useWorkspaceHost();
  useRepositionOnCanvasTransform(open);
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    return registerWorkspaceHostElement(host, content);
  }, [host, open]);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`${workspaceScopeClassName} ${contentClasses}`}
          {...contentProps}
          dir={direction}
          ref={contentRef}
        >
          <Popover.Arrow className={ARROW_CLASS_NAME} />
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
