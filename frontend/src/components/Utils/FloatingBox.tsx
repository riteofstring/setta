import { mouseLocation } from "forks/xyflow/core/utils/mouseLocation";
import _ from "lodash";
import { Resizable, ResizeCallback } from "re-resizable";
import React, { useEffect, useRef } from "react";
import { HiCheck, HiOutlineDuplicate } from "react-icons/hi";
import { getEmptySpacePosition } from "state/actions/sections/createSectionPlacement";
import { createTopLevelSection } from "state/actions/sections/createSections";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import { APP_FLOATING_BOX_Z_INDEX_CLASS_NAME } from "utils/constants";
import { SectionTypeEnum, TextBlockFormatEnum } from "utils/generatedTypes";
import { positiveMod, shortcutPrettified } from "utils/utils";
import { create } from "zustand";

type FloatingBoxContent = (
  | { content: string; title?: string }
  | { content?: string; title: string }
) & {
  titleClassName?: string;
  wrapperClassName?: string;
  contentClassName?: string;
};

type ZustandFloatingBoxState = {
  isFrozen: boolean;
  isEnabled: boolean;
  contentArray: Array<FloatingBoxContent>;
  idx: number;
  copied: boolean;
};

const useFloatingBox = create<ZustandFloatingBoxState>(() => ({
  isFrozen: false,
  isEnabled: false,
  contentArray: [],
  idx: 0,
  copied: false,
}));

const TOOLTIP_DIV_ID = "setta-tooltip-floating-box";

export function FloatingBox() {
  const { isEnabled, contentArray, isFrozen, idx, copied } = useFloatingBox();
  const boxRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const tooltipWidth = useLocalStorage((x) => x.tooltipWidth);

  const updateBoxPosition = (x: number, y: number) => {
    if (!boxRef.current) return;

    const box = boxRef.current;
    const rect = box.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Clamp horizontal
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 8;
    }
    // Clamp vertical
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 8;
    }

    positionRef.current = { x, y };
    box.style.transform = `translate(${x}px, ${y}px)`;
  };

  // Effect for non-frozen mode: follow mouse
  useEffect(() => {
    if (isFrozen || !isEnabled) return;

    const { x, y } = mouseLocation;
    updateBoxPosition(x + 10, y + 10);

    const handleMouseMove = (event: MouseEvent) => {
      updateBoxPosition(event.clientX + 10, event.clientY + 10);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isFrozen, isEnabled]);

  // Dragging logic for frozen mode
  const dragHandleMouseDown = (event: React.MouseEvent) => {
    if (!isFrozen || !boxRef.current) return;

    event.preventDefault();

    const rect = boxRef.current.getBoundingClientRect();
    dragStartRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    // Add mousemove only when dragging starts
    const handleDragMove = (e: MouseEvent) => {
      updateBoxPosition(
        e.clientX - dragStartRef.current.x,
        e.clientY - dragStartRef.current.y,
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleDragMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (!isEnabled || contentArray.length === 0) return null;

  return (
    <div
      id={TOOLTIP_DIV_ID}
      className={`absolute left-0 top-0 ${APP_FLOATING_BOX_Z_INDEX_CLASS_NAME}`}
      ref={boxRef}
      style={{
        transform: `translate(${positionRef.current.x}px, ${positionRef.current.y}px)`,
        width: `${tooltipWidth}px`,
      }}
    >
      <MaybeResizable
        isFrozen={isFrozen}
        className={`flex max-h-96 min-h-32 min-w-64 flex-col rounded-2xl border border-setta-200 bg-white p-4 shadow-lg focus:outline focus:outline-2 focus:outline-blue-600 dark:border-setta-700 dark:bg-setta-950 ${contentArray[idx] ? contentArray[idx].wrapperClassName : ""}`}
        tabIndex={0}
        width={tooltipWidth}
        onResizeStop={(_e, _direction, _ref, d) => {
          useLocalStorage.setState((state) => ({
            tooltipWidth: state.tooltipWidth + d.width,
          }));
        }}
      >
        {isFrozen && (
          <div
            className="absolute left-0 right-0 top-0 h-8 cursor-move rounded-t-2xl bg-transparent"
            onMouseDown={dragHandleMouseDown}
          />
        )}
        {contentArray[idx] && (
          <>
            <TooltipCopyButton item={contentArray[idx]} copied={copied} />
            <TooltipPage item={contentArray[idx]} isFrozen={isFrozen} />
          </>
        )}
        <TooltipPageCountIndicator numPages={contentArray.length} idx={idx} />
      </MaybeResizable>
    </div>
  );
}

function MaybeResizable({
  isFrozen,
  className,
  tabIndex,
  children,
  onResizeStop,
  width,
}: {
  isFrozen: boolean;
  className: string;
  tabIndex: number;
  children: React.ReactNode;
  width: number;
  onResizeStop: ResizeCallback;
}) {
  return isFrozen ? (
    <Resizable
      size={{ width, height: "auto" }}
      className={className}
      onResizeStop={onResizeStop}
      enable={{
        top: false,
        right: true,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
    >
      {children}
    </Resizable>
  ) : (
    <div className={className} tabIndex={tabIndex}>
      {children}
    </div>
  );
}

const TooltipPage = React.memo(
  ({ item, isFrozen }: { item: FloatingBoxContent; isFrozen: boolean }) => {
    return (
      <>
        {item.title && (
          <h3
            className={`break-words pb-1 pr-4 text-xs font-black uppercase text-setta-500 dark:text-setta-600 ${item.titleClassName}`}
          >
            {item.title}
          </h3>
        )}
        <article
          className={`flex-1 overflow-y-auto whitespace-pre-line break-words pr-4 text-sm text-setta-700 dark:text-setta-300 ${item.contentClassName}`}
        >
          {item.content}
        </article>
        {!!item.content && <FooterSwitch isFrozen={isFrozen} />}
      </>
    );
  },
  _.isEqual,
);

const TooltipCopyButton = React.memo(
  ({ item, copied }: { item: FloatingBoxContent; copied: boolean }) => {
    const handleCopy = async () => {
      try {
        const content = item.content ?? item.title;
        if (!content) {
          throw new Error("Floating box content is undefined");
        }
        await navigator.clipboard.writeText(content);
        setTimeout(() => {
          useFloatingBox.setState({ copied: false });
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    function onClick(e) {
      e.stopPropagation();
      useFloatingBox.setState({ copied: true });
    }

    useEffect(() => {
      if (copied) {
        handleCopy();
      }
    }, [copied]);

    return (
      <button
        onClick={onClick}
        className="tooltip-copy absolute right-2 top-2 cursor-pointer rounded-lg p-1.5 text-setta-500 hover:bg-setta-100 dark:text-setta-400 dark:hover:bg-setta-800"
        aria-label={copied ? "Copied!" : "Copy to clipboard"}
      >
        {copied ? (
          <HiCheck className="h-4 w-4" />
        ) : (
          <HiOutlineDuplicate className="h-4 w-4" />
        )}
      </button>
    );
  },
  _.isEqual,
);

const TooltipPageCountIndicator = React.memo(
  ({ numPages, idx }: { numPages: number; idx: number }) => {
    return numPages > 1 ? (
      <div className="tooltip-page mt-4 flex items-center justify-center gap-2">
        {Array.from({ length: numPages }).map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full ${
              i === idx ? "bg-blue-500" : "bg-setta-300 dark:bg-setta-600"
            }`}
            aria-label={`Page ${i + 1} of ${numPages}${i === idx ? " (current)" : ""}`}
          />
        ))}
      </div>
    ) : null;
  },
);

function FooterSwitch({ isFrozen }) {
  const className =
    "tooltip-footer mt-4 border-t border-solid border-setta-100 pt-1 text-[10px] text-setta-500 dark:border-setta-700 dark:text-setta-600";

  return isFrozen ? (
    <FrozenFooter className={className} />
  ) : (
    <Footer className={className} />
  );
}

function FrozenFooter({ className }) {
  const shortcuts = useSettings((x) => {
    return {
      frozenTooltipToPlaintextShortcut: shortcutPrettified(
        x.shortcuts.frozenTooltipToPlaintextShortcut,
      ),
      frozenTooltipToMarkdownShortcut: shortcutPrettified(
        x.shortcuts.frozenTooltipToMarkdownShortcut,
      ),
    };
  }, _.isEqual);

  return (
    <p className={className}>
      press <span className="font-black">&quot;Esc&quot;</span> to close, or{" "}
      <span className="font-black">
        &quot;{shortcuts.frozenTooltipToPlaintextShortcut}&quot;
      </span>{" "}
      (plaintext) or{" "}
      <span className="font-black">
        &quot;{shortcuts.frozenTooltipToMarkdownShortcut}&quot;
      </span>{" "}
      (markdown) to open tooltip as new section
    </p>
  );
}

function Footer({ className }) {
  const shortcuts = useSettings((x) => {
    return {
      tooltipToPlaintextShortcut: shortcutPrettified(
        x.shortcuts.tooltipToPlaintextShortcut,
      ),
      tooltipToMarkdownShortcut: shortcutPrettified(
        x.shortcuts.tooltipToMarkdownShortcut,
      ),
      freezeTooltipShortcut: shortcutPrettified(
        x.shortcuts.freezeTooltipShortcut,
      ),
    };
  }, _.isEqual);

  return (
    <ul className={className}>
      <li>
        <strong className="font-black tracking-tighter">
          &quot;{shortcuts.tooltipToPlaintextShortcut}&quot;
        </strong>{" "}
        convert to plaintext section
      </li>
      <li>
        <strong className="font-black tracking-tighter">
          &quot;{shortcuts.tooltipToMarkdownShortcut}&quot;
        </strong>{" "}
        convert to markdown section
      </li>
      <li>
        <strong className="font-black tracking-tighter">
          &quot;{shortcuts.freezeTooltipShortcut}&quot;
        </strong>{" "}
        freeze tooltip
      </li>
    </ul>
  );
}

export function getFloatingBoxHandlers(
  ...contentArray: Array<FloatingBoxContent>
) {
  function onMouseEnter() {
    if (contentArray && !useFloatingBox.getState().isFrozen) {
      useFloatingBox.setState({ contentArray });
    }
  }

  function onMouseLeave() {
    if (!useFloatingBox.getState().isFrozen) {
      useFloatingBox.setState({ contentArray: [], idx: 0, copied: false });
    }
  }

  return { onMouseEnter, onMouseLeave };
}

export function enableFloatingBox() {
  useFloatingBox.setState({ isEnabled: true });
}

export function disableFloatingBox() {
  useFloatingBox.setState({ isEnabled: false, idx: 0 });
}

export function getConvertFloatingBoxToSectionFn(renderMarkdown: boolean) {
  return () => {
    const s = useFloatingBox.getState();
    const item = s.contentArray[s.idx];
    if (item) {
      const content = item.title
        ? `## ${item.title}\n\n${item.content}`
        : item.content;
      if (content) {
        createTopLevelSection({
          implType: SectionTypeEnum.TextBlock,
          implOverrides: {
            type: SectionTypeEnum.TextBlock,
            size: { width: 300, height: 300 },
            format: renderMarkdown
              ? TextBlockFormatEnum.Markdown
              : TextBlockFormatEnum.Plaintext,
            text: content,
          },
          position: getEmptySpacePosition(),
        });
      }
    }
    // if converting a frozen floating box, then we need to remove it
    removeFrozenFloatingBox();
  };
}

export function freezeFloatingBox() {
  useFloatingBox.setState({ isEnabled: true, isFrozen: true });
  document.getElementById(TOOLTIP_DIV_ID)?.focus({ preventScroll: true });
}

export function removeFrozenFloatingBox() {
  useFloatingBox.setState({
    isEnabled: false,
    isFrozen: false,
    contentArray: [],
  });
}

export function incrementFloatingBoxIdx() {
  if (!useFloatingBox.getState().contentArray) {
    return;
  }
  useFloatingBox.setState((state) => {
    return { idx: positiveMod(state.idx + 1, state.contentArray.length) };
  });
}

export function decrementFloatingBoxIdx() {
  if (!useFloatingBox.getState().contentArray) {
    return;
  }
  useFloatingBox.setState((state) => ({
    idx: positiveMod(state.idx - 1, state.contentArray.length),
  }));
}

export async function copyFloatingBoxContent() {
  if (!useFloatingBox.getState().contentArray) {
    return;
  }
  useFloatingBox.setState({ copied: true });
}

export function incrementFrozenFloatingBoxIdx() {
  if (tooltipOrChildrenFocused()) {
    incrementFloatingBoxIdx();
  }
}

export function decrementFrozenFloatingBoxIdx() {
  if (tooltipOrChildrenFocused()) {
    decrementFloatingBoxIdx();
  }
}

export function copyFrozenFloatingBoxContent() {
  if (tooltipOrChildrenFocused()) {
    copyFloatingBoxContent();
  }
}

function tooltipOrChildrenFocused() {
  if (
    useFloatingBox.getState().isEnabled &&
    useFloatingBox.getState().isFrozen
  ) {
    const tooltipDiv = document.getElementById(TOOLTIP_DIV_ID);
    return tooltipDiv?.contains(document.activeElement);
  }
  return false;
}
