import {
  TextInputCodeMirror,
  type TextInputCodeMirrorInitialActivationEvent,
} from "components/Utils/CodeMirror/TextInputCodeMirror";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { type CodeObjType } from "utils/generatedTypes";
import { type ParamValueChange } from "./ConfiguredParamInputs";
import { resolveTextLikeParamEditorPolicy } from "./textLikeEditorPolicy";
import { dummyCodeClass, realCodeClass } from "./textLikeParamCodeMirrorVisual";

export type ParamUITextInputInitialActivationEvent =
  TextInputCodeMirrorInitialActivationEvent;

export function TextParamConfigured({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onActivity,
  onBlur,
  onEscape,
  maybeErrorMessage,
  isDisabled,
  codeObjType,
  configLanguage,
  waitingForResult,
  isSelectingParams,
  focusActiveSectionOnTextInput,
  textInputInitialActivationEvent,
  tooltipParentDivId,
}: {
  sectionId: string;
  paramInfoId: string;
  value: string;
  defaultVal: string;
  onChange: ParamValueChange;
  onActivity?: (() => void) | undefined;
  onBlur?: () => void;
  onEscape: () => void;
  maybeErrorMessage: string | undefined;
  isDisabled: boolean;
  codeObjType: CodeObjType;
  configLanguage: string;
  waitingForResult: boolean;
  isSelectingParams: boolean;
  focusActiveSectionOnTextInput: boolean;
  textInputInitialActivationEvent?:
    | ParamUITextInputInitialActivationEvent
    | null
    | undefined;
  tooltipParentDivId: string | null | undefined;
}) {
  const resolvedTooltipParentDivId =
    tooltipParentDivId === undefined
      ? CODEMIRROR_TOOLTIP_PARENT_ID
      : tooltipParentDivId;
  const editorPolicy = resolveTextLikeParamEditorPolicy({
    codeObjType,
    configLanguage,
  });
  return (
    <>
      <TextInputCodeMirror
        dummyDivId={`${sectionId}-${paramInfoId}-ParamInput`}
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        defaultVal={defaultVal}
        onChange={onChange}
        onActivity={onActivity}
        onBlur={onBlur}
        onMouseDown={undefined}
        onEscape={(completionResult) => {
          if (!completionResult) {
            onEscape();
          }
        }}
        dummyCodeClassName={dummyCodeClass(
          Boolean(maybeErrorMessage),
          true,
          isDisabled,
        )}
        realCodeClassName={realCodeClass(Boolean(maybeErrorMessage))}
        language={configLanguage}
        singleLine={editorPolicy?.linePolicy === "single-line"}
        wrapLines={editorPolicy?.wrapLines}
        keyComboActions={undefined}
        onTab={undefined}
        color={undefined}
        isDisabled={isDisabled}
        focusActiveSectionOnMouseDown={focusActiveSectionOnTextInput}
        initialActivationEvent={textInputInitialActivationEvent}
        tooltipParentDivId={resolvedTooltipParentDivId}
        completionsFn={undefined}
      />
      {waitingForResult && (
        <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
      )}
      <span
        className={`section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30 ${!isSelectingParams ? "peer-focus-within/textinput:border-blue-400" : ""}`}
      />
    </>
  );
}
