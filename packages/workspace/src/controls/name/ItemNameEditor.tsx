import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState, type MouseEvent } from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { focusSectionAfterEscape } from "../sectionFocus";
import { DummyCodeMirror } from "../text/DummyCodeMirror";
import {
  getOnCreateEditor,
  type TextValueActivationEvent,
} from "../text/onCreateEditor";
import {
  getTextValueExtensions,
  TEXT_VALUE_BASIC_SETUP,
} from "../text/textValueExtensions";
import type { TextValueLanguage } from "../text/textValueLanguages";
import {
  mountTextValueThemeStyles,
  useTextValueTheme,
  type TextValueTheme,
} from "../text/textValueTheme";
import { ItemNameErrorBubble } from "./ItemNameErrorBubble";
import { useWorkspaceHost } from "../../workspaceHostContext";

// The item-controls milestone's editable label: the reference `ParamNameInput` at its kwarg
// presentation, behind a controlled proposed-name seam. The package owns only the two-layer
// editor, label-column geometry, interaction boundaries, and captured error presentation.
// Normalization, uniqueness rules, display-name meaning, and persistence remain host-owned.

export type ItemNameEditorProps = {
  sectionId: string;
  itemId: string;
  name: string;
  onNameChange: (proposedName: string) => void;
  onBlur?: () => void;
  errorMessage?: string;
  placeholder?: string;
  language?: TextValueLanguage | null;
  hasChildren?: boolean;
  disabled?: boolean;
  onEscape?: () => void;
};

type ResolvedItemNameEditorProps = Omit<
  ItemNameEditorProps,
  "errorMessage" | "placeholder" | "language" | "hasChildren" | "disabled"
> & {
  errorMessage: string;
  placeholder: string;
  language: TextValueLanguage | null;
  hasChildren: boolean;
  disabled: boolean;
};

type ItemNameEditorCoreProps = ResolvedItemNameEditorProps & {
  reserveEndControlSpace: boolean;
};

function resolveItemNameEditorProps(
  props: ItemNameEditorProps,
): ResolvedItemNameEditorProps {
  return {
    ...props,
    errorMessage: props.errorMessage ?? "",
    placeholder: props.placeholder ?? "Add Key",
    language: props.language ?? null,
    hasChildren: props.hasChildren ?? false,
    disabled: props.disabled ?? false,
  };
}

function getLayoutClassName(
  hasChildren: boolean,
  layoutPadding: string,
): string {
  if (hasChildren) {
    return `section-key-value grid-row-start-1 ${layoutPadding}`;
  }
  return "section-key";
}

function getLayerStackClassName(hasChildren: boolean): string {
  return `${getLayoutClassName(hasChildren, "")} single-cell-container min-w-0 self-end`;
}

function getErrorClassName(hasError: boolean): string {
  return hasError
    ? "text-red-500 dark:text-red-300 border-red-400 [&_*]:!text-red-500 dark:[&_*]:!text-red-300"
    : "";
}

function getDummyClassName(
  hasChildren: boolean,
  isDisabled: boolean,
  hasError: boolean,
  reserveEndControlSpace: boolean,
): string {
  const layoutPadding = hasChildren ? "px-[2px]" : "";
  const selectionClassName = isDisabled ? "" : "cursor-text select-text";
  const endControlClassName = reserveEndControlSpace ? "pe-7" : "";
  return `${NO_PAN_CLASS_NAME} single-cell-child min-w-0 self-end placeholder:text-setta-300 dark:placeholder:text-setta-600 ${layoutPadding} ${NO_DRAG_CLASS_NAME} peer/nameinput ${selectionClassName} ${endControlClassName} break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400 ${getErrorClassName(hasError)}`;
}

function getLiveClassName(
  hasChildren: boolean,
  hasError: boolean,
  reserveEndControlSpace: boolean,
): string {
  const layoutPadding = hasChildren ? "px-[2px]" : "";
  const endControlClassName = reserveEndControlSpace ? "pe-7" : "";
  return `${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} single-cell-child cursor-text self-end select-text [&_*]:!outline-0 [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs min-w-0 placeholder:text-setta-300 dark:placeholder:text-setta-600 py-[.125rem] ${layoutPadding} ${endControlClassName} peer/nameinput font-mono dark:focus-visible:border-blue-400 ${getErrorClassName(hasError)}`;
}

function getUnderlineClassName(
  hasChildren: boolean,
  hasError: boolean,
): string {
  const layoutMargin = hasChildren ? "mx-[2px]" : "";
  const errorClassName = hasError ? "border-red-400" : "";
  return `single-cell-child ${layoutMargin} border-box self-end border-b border-setta-200/50 peer-focus-within/nameinput:border-blue-400 dark:border-setta-600/30 ${errorClassName}`;
}

function getElementIds(sectionId: string, itemId: string) {
  return {
    dummyEditorId: `ItemNameInput-${sectionId}-${itemId}`,
    liveEditorId: `CodeMirror-${sectionId}-${itemId}-keyName`,
    errorId: `ItemNameError-${sectionId}-${itemId}`,
  };
}

function useItemNameActivation({
  sectionId,
  isDisabled,
  onBlur,
}: {
  sectionId: string;
  isDisabled: boolean;
  onBlur: (() => void) | undefined;
}) {
  const host = useWorkspaceHost();
  const [activationEvent, setActivationEvent] =
    useState<TextValueActivationEvent | null>(null);
  const [liveIsInitialized, setLiveIsInitialized] = useState(false);

  function localOnBlur() {
    // The reference defers the layer reset to avoid CodeMirror blocking the next input focus.
    setTimeout(() => {
      setActivationEvent(null);
      setLiveIsInitialized(false);
    }, 0);
    onBlur?.();
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
    if (!isDisabled && !activationEvent) {
      setActivationEvent("tab");
    }
  }

  return {
    activationEvent,
    liveIsInitialized,
    localOnBlur,
    localOnMouseDownCapture,
    onFocus,
    setLiveIsInitialized,
  };
}

export function ItemNameEditor(props: ItemNameEditorProps) {
  return (
    <ItemNameEditorCore
      {...resolveItemNameEditorProps(props)}
      reserveEndControlSpace={false}
    />
  );
}

// Package-owned typed rows reserve their label's logical end for the B3 help disclosure without
// adding that layout-only concern to the public ItemNameEditor props.
export function BuiltInItemNameEditor(
  props: ItemNameEditorProps & { reserveEndControlSpace: boolean },
) {
  const { reserveEndControlSpace, ...editorProps } = props;
  return (
    <ItemNameEditorCore
      {...resolveItemNameEditorProps(editorProps)}
      reserveEndControlSpace={reserveEndControlSpace}
    />
  );
}

function ItemNameEditorCore({
  reserveEndControlSpace,
  ...props
}: ItemNameEditorCoreProps) {
  const host = useWorkspaceHost();
  const {
    sectionId,
    itemId,
    name,
    onNameChange,
    onBlur,
    errorMessage,
    placeholder,
    language,
    hasChildren,
    disabled,
    onEscape,
  } = props;
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  const hasError = errorMessage.length > 0;
  const theme = useTextValueTheme("green");
  const { dummyEditorId, errorId, liveEditorId } = getElementIds(
    sectionId,
    itemId,
  );
  const {
    activationEvent,
    liveIsInitialized,
    localOnBlur,
    localOnMouseDownCapture,
    onFocus,
    setLiveIsInitialized,
  } = useItemNameActivation({ sectionId, isDisabled, onBlur });

  useEffect(() => {
    mountTextValueThemeStyles();
  }, []);

  return (
    <>
      <div
        className={getLayerStackClassName(hasChildren)}
        data-item-name-layer-stack="true"
      >
        {!liveIsInitialized && (
          <DummyCodeMirror
            divId={dummyEditorId}
            code={name}
            onMouseDownCapture={localOnMouseDownCapture}
            onFocus={onFocus}
            className={getDummyClassName(
              hasChildren,
              isDisabled,
              hasError,
              reserveEndControlSpace,
            )}
            singleLine={true}
            wrapLines={true}
            theme={theme}
            placeholder={placeholder}
            language={language}
            ariaLabel="Item name"
            ariaDescribedBy={hasError ? errorId : undefined}
            ariaInvalid={hasError}
            ariaDisabled={isDisabled}
          />
        )}
        {activationEvent && (
          <LiveItemNameEditor
            liveEditorId={liveEditorId}
            name={name}
            placeholder={placeholder}
            language={language}
            theme={theme}
            initialEvent={activationEvent}
            liveIsInitialized={liveIsInitialized}
            setLiveIsInitialized={setLiveIsInitialized}
            onNameChange={onNameChange}
            onEscape={() =>
              onEscape ? onEscape() : focusSectionAfterEscape(host, sectionId)
            }
            onBlur={localOnBlur}
            className={getLiveClassName(
              hasChildren,
              hasError,
              reserveEndControlSpace,
            )}
            errorId={hasError ? errorId : undefined}
          />
        )}
        <span className={getUnderlineClassName(hasChildren, hasError)} />
      </div>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {errorMessage}
      </span>
      <ItemNameErrorBubble
        dummyEditorId={dummyEditorId}
        errorId={errorId}
        errorMessage={errorMessage}
        liveEditorId={liveEditorId}
        sectionId={sectionId}
      />
    </>
  );
}

function LiveItemNameEditor({
  liveEditorId,
  name,
  placeholder,
  language,
  theme,
  initialEvent,
  liveIsInitialized,
  setLiveIsInitialized,
  onNameChange,
  onEscape,
  onBlur,
  className,
  errorId,
}: {
  liveEditorId: string;
  name: string;
  placeholder: string;
  language: TextValueLanguage | null;
  theme: TextValueTheme;
  initialEvent: TextValueActivationEvent;
  liveIsInitialized: boolean;
  setLiveIsInitialized: (initialized: boolean) => void;
  onNameChange: (proposedName: string) => void;
  onEscape: () => void;
  onBlur: () => void;
  className: string;
  errorId: string | undefined;
}) {
  const host = useWorkspaceHost();
  const extensions = [
    ...getTextValueExtensions({
      language,
      singleLine: true,
      wrapLines: true,
      onEscape,
    }),
    getCodeMirrorContentAttributes(errorId),
  ];
  const onCreateEditor = getOnCreateEditor({
    host,
    initialEvent,
    setRealIsInitialized: setLiveIsInitialized,
    editorId: liveEditorId,
    value: name,
    placeholder,
  });
  return (
    <CodeMirror
      id={liveEditorId}
      className={`${className} ${!liveIsInitialized ? "opacity-0" : ""}`}
      value={name}
      placeholder={placeholder}
      basicSetup={TEXT_VALUE_BASIC_SETUP}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
      onChange={(nextName) => onNameChange(nextName)}
      onBlur={onBlur}
      indentWithTab={false}
    />
  );
}

function getCodeMirrorContentAttributes(errorId: string | undefined) {
  const attributes: Record<string, string> = {
    "aria-label": "Item name",
    spellcheck: "false",
  };
  if (errorId) {
    attributes["aria-invalid"] = "true";
    attributes["aria-describedby"] = errorId;
  }
  return EditorView.contentAttributes.of(attributes);
}
