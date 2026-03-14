import CodeMirror from "@uiw/react-codemirror";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalPendingValue } from "state/hooks/utils";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { route_set_prompt_template } from "utils/generatedEndpoints";
import { PromptFormatEnum, SectionTypeEnum } from "utils/generatedTypes";

type PromptViewMode = "template" | "preview";

export function PromptArea({ sectionId }: { sectionId: string }) {
  const {
    projectConfigId,
    template,
    format,
    isFrozen,
    renderedText,
    renderError,
    missingVariables,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Prompt,
    );
    return {
      projectConfigId: state.projectConfig.id,
      template: impl.template,
      format: impl.format,
      isFrozen: impl.isFrozen,
      renderedText: impl.renderedText,
      renderError: impl.renderError,
      missingVariables: impl.missingVariables,
    };
  }, _.isEqual);
  const { canEditParams } = useShareCapabilities();
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const isReadOnly = isFrozen || (isDeploymentMode && !canEditParams);
  const [viewMode, setViewMode] = useState<PromptViewMode>("template");
  const [value, setPendingValue] = useLocalPendingValue(
    template,
    (nextValue) => {
      useProjectState.setState((state) => {
        setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
          template: nextValue,
        });
      });
    },
  );

  const errorText = useMemo(() => {
    if (renderError) {
      return renderError;
    }
    if (missingVariables.length > 0) {
      return `Missing variables: ${missingVariables.join(", ")}`;
    }
    return "";
  }, [missingVariables, renderError]);

  useEffect(() => {
    setViewMode("template");
  }, [sectionId]);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });
  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    language: format === PromptFormatEnum.Jinja ? "markdown" : null,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: isReadOnly,
    onEscape: onEscapeFocusOnArticleDiv,
  });

  const debouncedSetTemplate = useCallback(
    _.debounce((nextTemplate: string) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
            template: nextTemplate,
          });
        },
        projectConfigId,
        send: (frontendOpId) =>
          route_set_prompt_template({
            projectConfigId,
            sectionId,
            template: nextTemplate,
            frontendOpId,
          }),
      });
    }, 50),
    [projectConfigId, sectionId],
  );

  function onChange(nextValue: string) {
    if (isReadOnly) {
      return;
    }
    setPendingValue(nextValue);
    debouncedSetTemplate(nextValue);
  }

  const editorMaxHeight =
    viewMode === "template" && maxHeight
      ? `calc(${maxHeight} - 32px)`
      : maxHeight;

  return (
    <div
      className={`${NO_PAN_CLASS_NAME} section-main-full-w flex min-h-0 flex-1 flex-col`}
    >
      <div className="mx-1 mt-1 flex shrink-0 items-center gap-1">
        <PromptModeButton
          sectionId={sectionId}
          label="Template"
          mode="template"
          isActive={viewMode === "template"}
          onClick={setViewMode}
        />
        <PromptModeButton
          sectionId={sectionId}
          label="Preview"
          mode="preview"
          isActive={viewMode === "preview"}
          onClick={setViewMode}
        />
      </div>

      {viewMode === "template" ? (
        <article
          id={`CodeMirror-${sectionId}-prompt-template`}
          ref={wrapperRef}
          className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} mx-1 mb-2 mt-1 flex min-h-0 flex-1 cursor-auto flex-col rounded-md border border-setta-200/70 bg-white/70 ${overflow} ${nowheel} nodrag dark:border-setta-700/70 dark:bg-setta-900/60 [&_*]:!outline-0`}
          data-section-main-editor
          data-testid={`prompt-template-editor-${sectionId}`}
          onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
          tabIndex={0}
        >
          <CodeMirror
            maxHeight={editorMaxHeight}
            value={value}
            theme={theme}
            extensions={extensions}
            onChange={onChange}
            onCreateEditor={handleCreateEditor}
            indentWithTab={false}
            basicSetup={{ tabSize: 2 }}
          />
        </article>
      ) : (
        <PromptPreview
          sectionId={sectionId}
          renderedText={renderedText}
          errorText={errorText}
        />
      )}
    </div>
  );
}

function PromptModeButton({
  sectionId,
  label,
  mode,
  isActive,
  onClick,
}: {
  sectionId: string;
  label: string;
  mode: PromptViewMode;
  isActive: boolean;
  onClick: (mode: PromptViewMode) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`prompt-${mode}-tab-${sectionId}`}
      className={`rounded px-2 py-1 text-[11px] font-medium ${
        isActive
          ? "bg-setta-200/80 text-setta-900 dark:bg-setta-700 dark:text-setta-50"
          : "text-setta-500 hover:bg-setta-100 dark:text-setta-400 dark:hover:bg-setta-800/70"
      }`}
      aria-pressed={isActive}
      onClick={() => onClick(mode)}
    >
      {label}
    </button>
  );
}

function PromptPreview({
  sectionId,
  renderedText,
  errorText,
}: {
  sectionId: string;
  renderedText: string;
  errorText: string;
}) {
  return (
    <div
      data-testid={`prompt-render-preview-${sectionId}`}
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-main -mt-1 mb-3 ml-1 mr-[13px] cursor-auto overflow-y-scroll pr-4 text-xs text-setta-700 dark:text-setta-300`}
    >
      {errorText ? (
        <div className="mx-2 mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {errorText}
        </div>
      ) : null}
      <pre className="whitespace-pre-wrap break-words px-2 py-2">
        {renderedText || "No prompt rendered yet."}
      </pre>
    </div>
  );
}
