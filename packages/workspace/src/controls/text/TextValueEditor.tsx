import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { BiError } from "react-icons/bi";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController.js";
import { useCodeMirrorTooltipParent } from "../../canvas/codeMirrorTooltipParent.js";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode.js";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction.js";
import { focusSectionAfterEscape } from "../sectionFocus.js";
import { DummyCodeMirror } from "./DummyCodeMirror.js";
import {
  getOnCreateEditor,
  type TextValueActivationEvent,
} from "./onCreateEditor.js";
import {
  getTextValueExtensions,
  TEXT_VALUE_BASIC_SETUP,
} from "./textValueExtensions.js";
import type { TextValueCompletionProvider } from "./textValueCompletion.js";
import type { TextValueLanguage } from "./editorLanguages.js";
import {
  mountTextValueThemeStyles,
  useTextValueTheme,
  type TextValueTheme,
} from "./textValueTheme.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import type { WorkspaceHost } from "../../workspaceHost.js";
import { getWorkspaceHostDomId } from "../../workspaceHostInternals.js";

export type TextValueEditorPresentation = "item-row" | "section-field";

type TextValueEditorBaseProps = {
  ariaLabel: string;
  sectionId: string;
  controlId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  onCommit?: (value: string) => void;

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
      diagnosticMessage?: never;
      endAdornment?: never;
      onAlternateCommit?: never;
    })
  | (TextValueEditorBaseProps & {
      presentation: "section-field";

      diagnosticMessage?: string;

      endAdornment?: ReactNode;

      uncommitted?: boolean;

      onAlternateCommit?: (value: string) => void;
    });

type TextValueEditorCoreProps = TextValueEditorBaseProps & {
  diagnosticMessage?: string;
  presentation: TextValueEditorPresentation | "meta-control";
  endAdornment?: ReactNode;
  uncommitted?: boolean;
  metaMinimumHeight?: boolean;
  onAlternateCommit?: (value: string) => void;
};

type MetaTextValueEditorProps = Omit<
  TextValueEditorCoreProps,
  | "completionProvider"
  | "diagnosticMessage"
  | "endAdornment"
  | "uncommitted"
  | "onAlternateCommit"
  | "presentation"
>;

type TextValueDiagnosticState = {
  ariaDescribedBy: string | undefined;
  descriptionId: string;
  hasDiagnostic: boolean;
};

function getItemRowDummyClassName(isDisabled: boolean) {
  return `${NO_PAN_CLASS_NAME} section-value self-end peer/textinput ${NO_DRAG_CLASS_NAME} ${!isDisabled ? "cursor-text select-text" : ""} break-words font-mono text-xs [tab-size:4] [word-break:break-word] py-[.125rem]`;
}

const ITEM_ROW_REAL_CLASS_NAME = `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} self-end peer/textinput [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs section-value py-[.125rem]`;
const META_CONTROL_WRAPPER_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-container h-full min-h-0 w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 text-[11px] font-mono text-setta-700 focus-within:border-blue-400 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200`;

function getMetaControlDummyClassName(isDisabled: boolean) {
  return `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] ${!isDisabled ? "cursor-text select-text" : ""}`;
}

const META_CONTROL_REAL_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4] cursor-text select-text [&_*]:!outline-0 [&_.cm-content]:!px-0 [&_.cm-content]:!py-0 [&_.cm-line]:!px-0`;

function getDividerClassName(isSelectingItems: boolean) {
  return `section-value self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingItems ? "peer-focus-within/textinput:border-blue-400" : ""}`;
}

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

function getTextValueDiagnosticState(
  host: WorkspaceHost,
  presentation: TextValueEditorCoreProps["presentation"],
  diagnostic: { message: string; uncommitted: boolean },
  sectionId: string,
  controlId: string,
): TextValueDiagnosticState {
  const hasDiagnostic =
    presentation === "section-field" &&
    !diagnostic.uncommitted &&
    diagnostic.message.trim() !== "";
  const descriptionId = `${getWorkspaceHostDomId(host)}-${sectionId}-${controlId}-SectionFieldDiagnostic`;
  return {
    ariaDescribedBy: hasDiagnostic ? descriptionId : undefined,
    descriptionId,
    hasDiagnostic,
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
  ariaLabel,
  diagnosticMessage,
  diagnosticDescriptionId,
  hasDiagnostic,
  isDisabled,
  presentation,
  uncommitted,
}: {
  config: TextValuePresentationConfig;
  editorLayers: ReactNode;
  endAdornment: ReactNode;
  ariaLabel: string;
  diagnosticMessage: string;
  diagnosticDescriptionId: string;
  hasDiagnostic: boolean;
  isDisabled: boolean;
  presentation: TextValueEditorCoreProps["presentation"];
  uncommitted: boolean;
}): ReactNode {
  if (!config.wrapperClassName) {
    return editorLayers;
  }
  if (presentation !== "section-field") {
    return <div className={config.wrapperClassName}>{editorLayers}</div>;
  }

  return (
    <div
      className={config.wrapperClassName}
      data-disabled={isDisabled}
      data-diagnostic={hasDiagnostic}
      data-uncommitted={uncommitted}
      data-workspace-section-field="true"
    >
      <div className="setta-workspace-section-field-input">{editorLayers}</div>
      <div className="setta-workspace-section-field-trailing">
        {hasDiagnostic ? (
          <span
            aria-hidden="true"
            className="setta-workspace-section-field-diagnostic-indicator"
            title={diagnosticMessage}
          >
            <BiError focusable="false" />
          </span>
        ) : null}
        {uncommitted ? (
          <span
            aria-atomic="true"
            aria-label={`${ariaLabel} changed. Press Enter to apply`}
            className="setta-workspace-section-field-apply-indicator"
            role="status"
            title="Press Enter to apply"
          >
            <i aria-hidden="true" className="gg-corner-right-down" />
          </span>
        ) : null}
        {endAdornment === undefined || endAdornment === null ? null : (
          <div className="setta-workspace-section-field-adornment">
            {endAdornment}
          </div>
        )}
      </div>
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        id={diagnosticDescriptionId}
        role="status"
      >
        {hasDiagnostic ? `Error: ${diagnosticMessage}` : ""}
      </span>
    </div>
  );
}

export function TextValueEditor(props: TextValueEditorProps) {
  return <TextValueEditorCore {...props} />;
}

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
  onAlternateCommit,
  onEscape,
  placeholder,
  language = null,
  singleLine = false,
  wrapLines,
  disabled = false,
  completionProvider,
  endAdornment,
  diagnosticMessage = "",
  uncommitted,
  presentation,
  metaMinimumHeight = false,
}: TextValueEditorCoreProps) {
  const host = useWorkspaceHost();
  const [activationEvent, setActivationEvent] =
    useState<TextValueActivationEvent | null>(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  const hasUncommittedDraft = uncommitted === true;
  const diagnosticState = getTextValueDiagnosticState(
    host,
    presentation,
    { message: diagnosticMessage, uncommitted: hasUncommittedDraft },
    sectionId,
    controlId,
  );
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
    setTimeout(() => {
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 0);
  }

  function localOnMouseDownCapture(event: MouseEvent<HTMLElement>) {
    if (isDisabled) {
      return;
    }
    if (event.button === 0) {
      setActivationEvent({ clientX: event.clientX, clientY: event.clientY });
      applyActiveSectionChange(host, { interaction: "input-focus", sectionId });
    }
  }

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
          ariaDescribedBy={diagnosticState.ariaDescribedBy}
          ariaInvalid={diagnosticState.hasDiagnostic}
          ariaDisabled={isDisabled}
        />
      )}
      {activationEvent && (
        <LiveTextValueEditor
          ariaLabel={ariaLabel}
          ariaDescribedBy={diagnosticState.ariaDescribedBy}
          ariaInvalid={diagnosticState.hasDiagnostic}
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
          onAlternateCommit={onAlternateCommit}
          disabled={isDisabled}
          completionProvider={completionProvider}
          onEscape={() => {
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
    ariaLabel,
    diagnosticDescriptionId: diagnosticState.descriptionId,
    diagnosticMessage,
    editorLayers,
    endAdornment,
    isDisabled,
    hasDiagnostic: diagnosticState.hasDiagnostic,
    presentation,
    uncommitted: hasUncommittedDraft,
  });
}

function LiveTextValueEditor({
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
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
  onAlternateCommit,
  disabled,
  completionProvider,
  onEscape,
  onBlur,
}: {
  ariaLabel: string;
  ariaDescribedBy: string | undefined;
  ariaInvalid: boolean;
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
  onAlternateCommit: ((value: string) => void) | undefined;
  disabled: boolean;
  completionProvider: TextValueCompletionProvider | undefined;
  onEscape: () => void;
  onBlur: () => void;
}) {
  const host = useWorkspaceHost();

  const tooltipParent = useCodeMirrorTooltipParent();
  const editorId = `${getWorkspaceHostDomId(host)}-CodeMirror-${sectionId}-${controlId}`;

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
      onAlternateCommit,
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
    getCodeMirrorContentAttributes(ariaLabel, ariaDescribedBy, ariaInvalid),
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
      indentWithTab={false}
    />
  );
}

function getCodeMirrorContentAttributes(
  ariaLabel: string,
  ariaDescribedBy: string | undefined,
  ariaInvalid: boolean,
) {
  const attributes: Record<string, string> = { "aria-label": ariaLabel };
  if (ariaInvalid) {
    attributes["aria-invalid"] = "true";
  }
  if (ariaDescribedBy !== undefined) {
    attributes["aria-describedby"] = ariaDescribedBy;
  }
  return EditorView.contentAttributes.of(attributes);
}
