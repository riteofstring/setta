import {
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ChatSlashCommandDefinition,
  getSlashCommandSuggestions,
} from "../chatComposerControls";
import { areSlashSuggestionsPortalStylesEqual } from "../chatInputHelpers";

import { focusComposerTextareaAtEnd } from "./keyboardHandlers";
import {
  SLASH_SUGGESTIONS_BASE_HEIGHT_PX,
  SLASH_SUGGESTIONS_EDGE_PADDING_PX,
  SLASH_SUGGESTIONS_INPUT_INSET_PX,
  SLASH_SUGGESTIONS_MAX_HEIGHT_PX,
  SLASH_SUGGESTIONS_ROW_HEIGHT_PX,
} from "./shared";

function resolveSlashSuggestionsPlacement(args: {
  estimatedMenuHeight: number;
  slashSuggestionsPlacement: "auto" | "above" | "below";
  spaceAbove: number;
  spaceBelow: number;
}): "above" | "below" {
  const {
    estimatedMenuHeight,
    slashSuggestionsPlacement,
    spaceAbove,
    spaceBelow,
  } = args;
  if (slashSuggestionsPlacement === "above") {
    return "above";
  }
  if (slashSuggestionsPlacement === "below") {
    return "below";
  }
  return spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove
    ? "below"
    : "above";
}

function resolveSlashSuggestionsPortalStyle(args: {
  inputRect: DOMRect;
  nextPlacement: "above" | "below";
}): CSSProperties {
  const { inputRect, nextPlacement } = args;
  const spaceAbove = inputRect.top - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
  const spaceBelow =
    window.innerHeight - inputRect.bottom - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
  const availableVerticalSpace =
    nextPlacement === "below" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(
    0,
    Math.min(SLASH_SUGGESTIONS_MAX_HEIGHT_PX, availableVerticalSpace),
  );
  const maxWidth = Math.max(
    0,
    window.innerWidth - SLASH_SUGGESTIONS_EDGE_PADDING_PX * 2,
  );
  const preferredWidth = Math.max(
    0,
    inputRect.width - SLASH_SUGGESTIONS_INPUT_INSET_PX * 2,
  );
  const width = Math.min(preferredWidth, maxWidth);
  const left = Math.max(
    SLASH_SUGGESTIONS_EDGE_PADDING_PX,
    Math.min(
      inputRect.left + SLASH_SUGGESTIONS_INPUT_INSET_PX,
      window.innerWidth - SLASH_SUGGESTIONS_EDGE_PADDING_PX - width,
    ),
  );
  const clampedTop =
    nextPlacement === "below"
      ? Math.max(
          SLASH_SUGGESTIONS_EDGE_PADDING_PX,
          Math.min(
            inputRect.bottom + SLASH_SUGGESTIONS_INPUT_INSET_PX,
            window.innerHeight - SLASH_SUGGESTIONS_EDGE_PADDING_PX - maxHeight,
          ),
        )
      : undefined;
  const clampedBottom =
    nextPlacement === "above"
      ? Math.max(
          SLASH_SUGGESTIONS_EDGE_PADDING_PX,
          Math.min(
            window.innerHeight -
              inputRect.top +
              SLASH_SUGGESTIONS_INPUT_INSET_PX,
            window.innerHeight - SLASH_SUGGESTIONS_EDGE_PADDING_PX,
          ),
        )
      : undefined;
  return {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    top: clampedTop !== undefined ? `${clampedTop}px` : undefined,
    bottom: clampedBottom !== undefined ? `${clampedBottom}px` : undefined,
  };
}

function resolveSlashSuggestionsDisplayState(args: {
  resolvedSlashPlacement: "above" | "below";
  shouldShowSlashSuggestions: boolean;
  slashSuggestionsPortalStyle: CSSProperties | null;
}): {
  canRenderSlashSuggestionsInPortal: boolean;
  slashSuggestionsPositionClass: string;
} {
  const {
    resolvedSlashPlacement,
    shouldShowSlashSuggestions,
    slashSuggestionsPortalStyle,
  } = args;
  return {
    canRenderSlashSuggestionsInPortal:
      shouldShowSlashSuggestions &&
      slashSuggestionsPortalStyle !== null &&
      typeof document !== "undefined" &&
      Boolean(document.body),
    slashSuggestionsPositionClass:
      resolvedSlashPlacement === "below"
        ? "top-[calc(100%+4px)]"
        : "bottom-[calc(100%+4px)]",
  };
}

export function useChatInputSlashSuggestions(args: {
  inputValue: string;
  setInputValue: (nextValue: string) => void;
  setSlashFeedback: (value: string | null) => void;
  slashCommands: ChatSlashCommandDefinition[];
  slashSuggestionsPlacement: "auto" | "above" | "below";
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
}): {
  activeSlashIndex: number;
  applySlashSuggestion: (index: number) => void;
  canRenderSlashSuggestionsInPortal: boolean;
  setActiveSlashIndex: (value: number | ((current: number) => number)) => void;
  shouldShowSlashSuggestions: boolean;
  slashSuggestions: ChatSlashCommandDefinition[];
  slashSuggestionsList: ReactNode;
  slashSuggestionsPortalStyle: CSSProperties | null;
  slashSuggestionsPositionClass: string;
} {
  const {
    inputValue,
    setInputValue,
    setSlashFeedback,
    slashCommands,
    slashSuggestionsPlacement,
    textareaRef,
  } = args;
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [resolvedSlashPlacement, setResolvedSlashPlacement] = useState<
    "above" | "below"
  >(slashSuggestionsPlacement === "above" ? "above" : "below");
  const [slashSuggestionsPortalStyle, setSlashSuggestionsPortalStyle] =
    useState<CSSProperties | null>(null);
  const slashSuggestions = useMemo(
    () => getSlashCommandSuggestions(inputValue, slashCommands),
    [inputValue, slashCommands],
  );
  const shouldShowSlashSuggestions = useMemo(() => {
    if (slashSuggestions.length === 0) {
      return false;
    }
    return /^\/[^\s]*$/u.test(inputValue.trimStart());
  }, [inputValue, slashSuggestions.length]);

  useEffect(() => {
    if (!shouldShowSlashSuggestions) {
      setActiveSlashIndex(0);
      return;
    }
    setActiveSlashIndex((current) =>
      Math.min(current, Math.max(0, slashSuggestions.length - 1)),
    );
  }, [shouldShowSlashSuggestions, slashSuggestions.length]);

  const updateSlashSuggestionsLayout = useCallback(() => {
    if (!shouldShowSlashSuggestions) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const inputNode = textareaRef.current;
    if (!inputNode) {
      return;
    }
    const inputRect = inputNode.getBoundingClientRect();
    const spaceAbove = inputRect.top - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
    const spaceBelow =
      window.innerHeight - inputRect.bottom - SLASH_SUGGESTIONS_EDGE_PADDING_PX;
    const estimatedMenuHeight = Math.min(
      SLASH_SUGGESTIONS_MAX_HEIGHT_PX,
      SLASH_SUGGESTIONS_BASE_HEIGHT_PX +
        slashSuggestions.length * SLASH_SUGGESTIONS_ROW_HEIGHT_PX,
    );
    const nextPlacement = resolveSlashSuggestionsPlacement({
      estimatedMenuHeight,
      slashSuggestionsPlacement,
      spaceAbove,
      spaceBelow,
    });
    setResolvedSlashPlacement((current) =>
      current === nextPlacement ? current : nextPlacement,
    );
    const nextStyle = resolveSlashSuggestionsPortalStyle({
      inputRect,
      nextPlacement,
    });
    setSlashSuggestionsPortalStyle((current) => {
      if (areSlashSuggestionsPortalStylesEqual(current, nextStyle)) {
        return current;
      }
      return nextStyle;
    });
  }, [
    shouldShowSlashSuggestions,
    slashSuggestions.length,
    slashSuggestionsPlacement,
    textareaRef,
  ]);

  useEffect(() => {
    if (!shouldShowSlashSuggestions) {
      setSlashSuggestionsPortalStyle((current) =>
        current === null ? current : null,
      );
      setResolvedSlashPlacement(
        slashSuggestionsPlacement === "above" ? "above" : "below",
      );
      return;
    }
    updateSlashSuggestionsLayout();
    if (typeof window === "undefined") {
      return;
    }
    const handleViewportChange = () => {
      requestAnimationFrame(() => {
        updateSlashSuggestionsLayout();
      });
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [
    shouldShowSlashSuggestions,
    slashSuggestionsPlacement,
    updateSlashSuggestionsLayout,
  ]);

  const applySlashSuggestion = useCallback(
    (index: number) => {
      const suggestion = slashSuggestions[index];
      if (!suggestion) {
        return;
      }
      setInputValue(`${suggestion.command} `);
      setActiveSlashIndex(index);
      setSlashFeedback(null);
      focusComposerTextareaAtEnd(textareaRef, `${suggestion.command} `);
    },
    [setInputValue, setSlashFeedback, slashSuggestions, textareaRef],
  );

  const slashSuggestionsList = useMemo(
    () => (
      <>
        {slashSuggestions.map((suggestion, index) => (
          <button
            key={suggestion.command}
            type="button"
            className={`flex w-full min-w-0 flex-col items-start gap-0.5 rounded px-2 py-1 text-left text-xs transition-colors ${
              index === activeSlashIndex
                ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-100"
                : "text-setta-600 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applySlashSuggestion(index)}
          >
            <span className="w-full truncate font-semibold">
              {suggestion.command}
            </span>
            <span className="w-full truncate text-[10px] text-setta-400 dark:text-setta-500">
              {suggestion.summary}
            </span>
          </button>
        ))}
      </>
    ),
    [activeSlashIndex, applySlashSuggestion, slashSuggestions],
  );

  const { canRenderSlashSuggestionsInPortal, slashSuggestionsPositionClass } =
    resolveSlashSuggestionsDisplayState({
      resolvedSlashPlacement,
      shouldShowSlashSuggestions,
      slashSuggestionsPortalStyle,
    });

  return {
    activeSlashIndex,
    applySlashSuggestion,
    canRenderSlashSuggestionsInPortal,
    setActiveSlashIndex,
    shouldShowSlashSuggestions,
    slashSuggestions,
    slashSuggestionsList,
    slashSuggestionsPortalStyle,
    slashSuggestionsPositionClass,
  };
}
