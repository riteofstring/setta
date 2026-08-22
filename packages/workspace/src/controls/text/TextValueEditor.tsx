import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useCodeMirrorTooltipParent } from "../../canvas/codeMirrorTooltipParent";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { focusSectionAfterEscape } from "../sectionFocus";
import { DummyCodeMirror } from "./DummyCodeMirror";
import {
  getOnCreateEditor,
  type TextValueActivationEvent,
} from "./onCreateEditor";
import {
  getTextValueExtensions,
  TEXT_VALUE_BASIC_SETUP,
} from "./textValueExtensions";
import type { TextValueCompletionProvider } from "./textValueCompletion";
import type { TextValueLanguage } from "./textValueLanguages";
import {
  mountTextValueThemeStyles,
  useTextValueTheme,
  type TextValueTheme,
} from "./textValueTheme";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { getWorkspaceHostDomId } from "../../workspaceHostInternals";

// The item-controls milestone's text value editor: the reference's two-layer
// `TextInputCodeMirror` at the `ParamUI` text presentation, behind the package's controlled
// string seam. The idle layer is the highlighted dummy; a primary mouse-down capture or a
// keyboard focus swaps in the live CodeMirror editor, every document change reports once
// through the host subscription, and Escape reports to the caller holding the draft before
// returning focus to the owning section. Backend editor
// services (completion, diagnostics, the waiting spinner) and the reference's error-message
// plumbing stay application-side. The control disables from the host flag and, package-wide,
// while item-select mode is active — the reference's interaction-first disabled contract with
// no blanket opacity treatment.
//
// One editor core serves every placement. The public presentations are the parameter row and
// the compact section field a section renders above its item toolbar (the reference's own
// callable-first composition); the meta-control placement stays a package-internal seam. The
// lifecycle, controlled-value path, completion adapter, keymap, activation model, and theme are
// shared — presentations differ only in their surrounding surface.

// The two supported public placements. `item-row` is the parameter-row control; `section-field`
// is the compact full-width field a section renders above its item toolbar. Callers state which
// one they mean; the package never guesses from an identifier or DOM position.
export type TextValueEditorPresentation = "item-row" | "section-field";

type TextValueEditorBaseProps = {
  ariaLabel: string;
  sectionId: string;
  controlId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  onCommit?: (value: string) => void;
  // Escape abandoned the editor without committing. A caller holding an uncommitted draft
  // restores its canonical value here, exactly as the reference's callable search does. An open
  // completion popup takes the first Escape for itself and this never runs for it. The package
  // still returns focus to the owning section afterwards.
  onEscape?: () => void;
  placeholder?: string;
  language?: TextValueLanguage | null;
  singleLine?: boolean;
  wrapLines?: boolean;
  disabled?: boolean;
  completionProvider?: TextValueCompletionProvider;
};

export type TextValueEditorProps =
  | (TextValueEditorBaseProps & {
      presentation: "item-row";
      endAdornment?: never;
    })
  | (TextValueEditorBaseProps & {
      presentation: "section-field";
      // The package owns the adornment's layout space inside the field surface; the caller owns
      // its content, semantics, and ARIA. It is never editor value and takes no keyboard behavior.
      endAdornment?: ReactNode;
    });

type TextValueEditorCoreProps = TextValueEditorBaseProps & {
  presentation: TextValueEditorPresentation | "meta-control";
  endAdornment?: ReactNode;
  metaMinimumHeight?: boolean;
};

type MetaTextValueEditorProps = Omit<
  TextValueEditorCoreProps,
  "completionProvider" | "endAdornment" | "presentation"
>;

// The reference `ParamUI` class strings for the text control, minus its backend error branch.
function getItemRowDummyClassName(isDisabled: boolean) {
  return `${NO_PAN_CLASS_NAME} section-value self-end peer/textinput ${NO_DRAG_CLASS_NAME} ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`;
}

const ITEM_ROW_REAL_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`;
const META_CONTROL_WRAPPER_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-container h-full min-h-0 w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 text-[11px] font-mono text-setta-700 focus-within:border-blue-400 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200`;

function getMetaControlDummyClassName(isDisabled: boolean) {
  return `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] ${!isDisabled ? "cursor-text select-text" : ""}`;
}

const META_CONTROL_REAL_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] cursor-text select-text [&_*]:!outline-0 [&_.cm-content]:!px-0 [&_.cm-content]:!py-0 [&_.cm-line]:!px-0`;

// The value-column divider with its `peer-focus-within` focus treatment; item-select mode
// suppresses the blue focus paint exactly as the reference's param-select mode does.
function getDividerClassName(isSelectingItems: boolean) {
  return `section-value self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingItems ? "peer-focus-within/textinput:border-blue-400" : ""}`;
}

// The compact section-field surface: one rounded, full-width field whose box geometry, type,
// focus treatment, and adornment gutter live in the scoped package stylesheet rather than in
// caller-supplied class strings. The wrapper owns the box and the shared editor class owns the
// type, so the idle and live layers paint the same field.
const SECTION_FIELD_WRAPPER_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} setta-workspace-section-field`;
const SECTION_FIELD_DUMMY_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} setta-workspace-section-field-editor`;
const SECTION_FIELD_REAL_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} setta-workspace-section-field-editor setta-workspace-section-field-editor-live`;

type TextValuePresentationConfig = {
  dummyClassName: string;
  realClassName: string;
  dummyIdSuffix: string;
  showDivider: boolean;
  wrapperClassName: string | null;
};

function getTextValuePresentationConfig(
  presentation: TextValueEditorCoreProps["presentation"],
  isDisabled: boolean,
  metaMinimumHeight: boolean,
): TextValuePresentationConfig {
  if (presentation === "meta-control") {
    const minimumHeightClassName = metaMinimumHeight ? " min-h-24" : "";
    return {
      dummyClassName: `${getMetaControlDummyClassName(isDisabled)}${minimumHeightClassName}`,
      realClassName: `${META_CONTROL_REAL_CLASS_NAME}${minimumHeightClassName}`,
      dummyIdSuffix: "MetaControl",
      showDivider: false,
      wrapperClassName: META_CONTROL_WRAPPER_CLASS_NAME,
    };
  }
  if (presentation === "section-field") {
    return {
      dummyClassName: SECTION_FIELD_DUMMY_CLASS_NAME,
      realClassName: SECTION_FIELD_REAL_CLASS_NAME,
      dummyIdSuffix: "SectionField",
      showDivider: false,
      wrapperClassName: SECTION_FIELD_WRAPPER_CLASS_NAME,
    };
  }
  return {
    dummyClassName: getItemRowDummyClassName(isDisabled),
    realClassName: ITEM_ROW_REAL_CLASS_NAME,
    dummyIdSuffix: "ItemValueInput",
    showDivider: true,
    wrapperClassName: null,
  };
}

function renderTextValueDivider(
  config: TextValuePresentationConfig,
  isSelectingItems: boolean,
): ReactNode {
  if (!config.showDivider) {
    return null;
  }
  return <span className={getDividerClassName(isSelectingItems)} />;
}

function wrapTextValueEditorLayers({
  config,
  editorLayers,
  endAdornment,
  isDisabled,
  presentation,
}: {
  config: TextValuePresentationConfig;
  editorLayers: ReactNode;
  endAdornment: ReactNode;
  isDisabled: boolean;
  presentation: TextValueEditorCoreProps["presentation"];
}): ReactNode {
  if (!config.wrapperClassName) {
    return editorLayers;
  }
  if (presentation !== "section-field") {
    return <div className={config.wrapperClassName}>{editorLayers}</div>;
  }
  // `data-workspace-section-field` is the one public hook for observing this surface. The package
  // owns its class names, so a consumer proving the field's geometry or capturing its states reads
  // this attribute instead of the private class the stylesheet paints.
  return (
    <div
      className={config.wrapperClassName}
      data-disabled={isDisabled}
      data-workspace-section-field="true"
    >
      <div className="setta-workspace-section-field-input">{editorLayers}</div>
      {endAdornment === undefined || endAdornment === null ? null : (
        <div className="setta-workspace-section-field-adornment">
          {endAdornment}
        </div>
      )}
    </div>
  );
}

export function TextValueEditor(props: TextValueEditorProps) {
  return <TextValueEditorCore {...props} />;
}

// Package-internal composition seam for the direct-on-canvas text control. The public item-row
// control keeps its established item vocabulary; MetaControl supplies its own control identity
// without duplicating the two-layer CodeMirror lifecycle.
export function MetaTextValueEditor({
  ariaLabel,
  sectionId,
  controlId,
  value,
  onValueChange,
  onCommit,
  placeholder,
  language = null,
  singleLine = false,
  wrapLines,
  disabled = false,
  metaMinimumHeight = false,
}: MetaTextValueEditorProps) {
  return (
    <TextValueEditorCore
      ariaLabel={ariaLabel}
      sectionId={sectionId}
      controlId={controlId}
      value={value}
      onValueChange={onValueChange}
      onCommit={onCommit}
      placeholder={placeholder}
      language={language}
      singleLine={singleLine}
      wrapLines={wrapLines}
      disabled={disabled}
      metaMinimumHeight={metaMinimumHeight}
      presentation="meta-control"
    />
  );
}

function TextValueEditorCore({
  ariaLabel,
  sectionId,
  controlId,
  value,
  onValueChange,
  onCommit,
  onEscape,
  placeholder,
  language = null,
  singleLine = false,
  wrapLines,
  disabled = false,
  completionProvider,
  endAdornment,
  presentation,
  metaMinimumHeight = false,
}: TextValueEditorCoreProps) {
  const host = useWorkspaceHost();
  const [activationEvent, setActivationEvent] =
    useState<TextValueActivationEvent | null>(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  const theme = useTextValueTheme();
  const presentationConfig = getTextValuePresentationConfig(
    presentation,
    isDisabled,
    metaMinimumHeight,
  );

  useEffect(() => {
    mountTextValueThemeStyles();
  }, []);

  function localOnBlur() {
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 0);
  }

  // Has to be onMouseDownCapture to avoid section outline flashing
  // when section is locked.
  function localOnMouseDownCapture(event: MouseEvent<HTMLElement>) {
    if (isDisabled) {
      return;
    }
    if (event.button === 0) {
      // Only the activating coordinates survive into state; the reference stores the event
      // object and reads the same two fields.
      setActivationEvent({ clientX: event.clientX, clientY: event.clientY });
      applyActiveSectionChange(host, { interaction: "input-focus", sectionId });
    }
  }

  // focused via tab key
  function onFocus() {
    if (isDisabled) {
      return;
    }
    if (!activationEvent) {
      setActivationEvent("tab");
    }
  }

  const editorLayers = (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          divId={`${getWorkspaceHostDomId(host)}-${sectionId}-${controlId}-${presentationConfig.dummyIdSuffix}`}
          code={value}
          onMouseDownCapture={localOnMouseDownCapture}
          onFocus={onFocus}
          className={presentationConfig.dummyClassName}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          placeholder={placeholder}
          language={language}
          ariaLabel={ariaLabel}
          ariaDisabled={isDisabled}
        />
      )}
      {activationEvent && (
        <LiveTextValueEditor
          ariaLabel={ariaLabel}
          sectionId={sectionId}
          controlId={controlId}
          value={value}
          placeholder={placeholder}
          language={language}
          singleLine={singleLine}
          wrapLines={wrapLines}
          theme={theme}
          className={presentationConfig.realClassName}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          onValueChange={onValueChange}
          onCommit={onCommit}
          disabled={isDisabled}
          completionProvider={completionProvider}
          onEscape={() => {
            // The caller drops its draft first, so the idle layer this Escape swaps back in
            // already paints the value it restored.
            onEscape?.();
            focusSectionAfterEscape(host, sectionId);
          }}
          onBlur={localOnBlur}
        />
      )}
      {renderTextValueDivider(presentationConfig, isSelectingItems)}
    </>
  );
  return wrapTextValueEditorLayers({
    config: presentationConfig,
    editorLayers,
    endAdornment,
    isDisabled,
    presentation,
  });
}

function LiveTextValueEditor({
  ariaLabel,
  sectionId,
  controlId,
  value,
  placeholder,
  language,
  singleLine,
  wrapLines,
  theme,
  className,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  onValueChange,
  onCommit,
  disabled,
  completionProvider,
  onEscape,
  onBlur,
}: {
  ariaLabel: string;
  sectionId: string;
  controlId: string;
  value: string;
  placeholder: string | undefined;
  language: TextValueLanguage | null;
  singleLine: boolean;
  wrapLines: boolean | undefined;
  theme: TextValueTheme;
  className: string;
  initialEvent: TextValueActivationEvent;
  realIsInitialized: boolean;
  setRealIsInitialized: (initialized: boolean) => void;
  onValueChange: (nextValue: string) => void;
  onCommit: ((value: string) => void) | undefined;
  disabled: boolean;
  completionProvider: TextValueCompletionProvider | undefined;
  onEscape: () => void;
  onBlur: () => void;
}) {
  const host = useWorkspaceHost();
  // The canvas renders one tooltip parent per host, so a completion popup opens beside the scene
  // instead of inside the section box that would clip it. No caller names, passes, or opts into it.
  const tooltipParent = useCodeMirrorTooltipParent();
  const editorId = `${getWorkspaceHostDomId(host)}-CodeMirror-${sectionId}-${controlId}`;
  // @uiw/react-codemirror replaces extensions in a passive effect. Keep the current disabled
  // state and controlled value available to already-installed input extensions during that
  // handoff.
  const disabledRef = useRef(disabled);
  const valueRef = useRef(value);
  const completionRequestRef = useRef<AbortController | null>(null);
  const completionRequests = useRef({
    abort() {
      completionRequestRef.current?.abort();
      completionRequestRef.current = null;
    },
    clear(controller: AbortController) {
      if (completionRequestRef.current === controller) {
        completionRequestRef.current = null;
      }
    },
    start() {
      completionRequestRef.current?.abort();
      const controller = new AbortController();
      completionRequestRef.current = controller;
      return controller;
    },
  }).current;
  useLayoutEffect(() => {
    disabledRef.current = disabled;
    valueRef.current = value;
  }, [disabled, value]);
  useEffect(() => {
    if (disabled) {
      completionRequests.abort();
    }
  }, [completionRequests, disabled]);
  useEffect(
    () => () => {
      completionRequests.abort();
    },
    [completionProvider, completionRequests],
  );
  const extensions = [
    ...getTextValueExtensions({
      language,
      singleLine,
      wrapLines,
      onEscape,
      onCommit,
      isDisabled: () => disabledRef.current,
      completionProvider,
      completionRequests,
      tooltipParent,
    }),
    EditorState.changeFilter.of((transaction) => {
      if (!disabledRef.current || !transaction.docChanged) {
        return true;
      }
      return transaction.newDoc.toString() === valueRef.current;
    }),
    EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
  ];
  const onCreateEditor = getOnCreateEditor({
    host,
    initialEvent,
    setRealIsInitialized,
    value,
    placeholder,
  });
  return (
    <CodeMirror
      id={editorId}
      className={`${className} ${!realIsInitialized ? "opacity-0" : ""}`}
      value={value}
      placeholder={placeholder}
      basicSetup={TEXT_VALUE_BASIC_SETUP}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
      editable={!disabled}
      readOnly={disabled}
      onChange={(nextValue) => {
        if (!disabledRef.current) {
          onValueChange(nextValue);
        }
      }}
      onBlur={onBlur}
      indentWithTab={false} // the reference binds Tab in its app extensions; the package binds none
    />
  );
}
