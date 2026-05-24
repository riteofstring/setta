import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  autoUpdateGpuFloatingPosition,
  createGpuFloatingVirtualPointReference,
} from "gpuFlow/portals/floatingPosition";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
import { NAVBAR_HEIGHT } from "utils/constants";

type ContextMenuCoreProps = {
  readonly ariaLabel?: string | undefined;
  readonly children: ReactNode;
  readonly closeContextMenu: () => void;
  readonly contentRole?: AriaRole | undefined;
  readonly isOpen: boolean;
  readonly onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement> | undefined;
  readonly x: number;
  readonly y: number;
};

type FloatingPositionState = {
  readonly left: string;
  readonly opacity: number;
  readonly position: "fixed";
  readonly top: string;
};

const HIDDEN_POSITION: FloatingPositionState = {
  left: "-9999px",
  opacity: 0,
  position: "fixed",
  top: "-9999px",
};

export function ContextMenuCore({
  ariaLabel,
  children,
  contentRole,
  x,
  y,
  isOpen,
  closeContextMenu,
  onKeyDownCapture,
}: ContextMenuCoreProps) {
  const ref = useOutsideAlerter(isOpen, closeContextMenu);
  const [position, setPosition] =
    useState<FloatingPositionState>(HIDDEN_POSITION);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(
    null,
  );
  const setContentRefs = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      setContentElement(element);
    },
    [ref],
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(HIDDEN_POSITION);
      return;
    }
    if (!contentElement) {
      return;
    }
    return autoUpdateGpuFloatingPosition({
      boundaryPadding: { bottom: 8, left: 8, right: 8, top: NAVBAR_HEIGHT },
      floating: contentElement,
      onPosition: setPosition,
      placement: "right-start",
      reference: createGpuFloatingVirtualPointReference({ x, y }),
    });
  }, [contentElement, x, y, isOpen]);

  const sharedContentProps = {
    className:
      "absolute z-10 flex max-h-[40vh] w-[clamp(5rem,_20vw,_10rem)] min-w-32 cursor-pointer flex-col overflow-y-auto rounded-md border border-solid border-setta-500/50 bg-white px-2 pb-2 pt-0 shadow-xl dark:bg-setta-900",
    "data-testid": "context-menu-core",
    onKeyDownCapture,
    ref: setContentRefs,
    style: {
      left: position.left,
      position: position.position,
      top: position.top,
      opacity: position.opacity,
    },
  };

  if (contentRole) {
    return isOpen ? (
      <div
        {...sharedContentProps}
        aria-label={ariaLabel}
        role={contentRole}
        tabIndex={-1}
      >
        {children}
      </div>
    ) : null;
  }

  return (
    <DropdownMenu.Root open={isOpen} modal={false}>
      <DropdownMenu.Content {...sharedContentProps}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

// https://stackoverflow.com/a/42234988
function useOutsideAlerter(isOpen: boolean, closeContextMenu: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target instanceof Node ? event.target : null;
      if (ref.current && target && !ref.current.contains(target) && isOpen) {
        closeContextMenu();
      }
    }
    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, isOpen]);
  return ref;
}
