import CodeMirror from "@uiw/react-codemirror";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import {
  codeAreaTabOnEnterKeyHandlers,
  useCodeAreaHeight,
} from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import { setPromptTemplate } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrSectionVariantId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalPendingValue } from "state/hooks/utils";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { FormatEnum, SectionTypeEnum } from "utils/generatedTypes";
import { resolvePromptSectionSource } from "utils/promptSectionSource";
type PromptViewMode = "template" | "preview";
export function PromptArea({ sectionId }: { sectionId: string }) {
  useHydrateAgenticState();
  const {
    projectConfigId,
    promptTemplateId,
    sectionVariantId,
    template,
    format,
    isFrozen,
    renderedText,
    renderError,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Prompt,
    );
    return {
      projectConfigId: state.projectConfig.id,
      promptTemplateId: impl.promptTemplateId ?? null,
      sectionVariantId: getCurrSectionVariantId(state, sectionId),
      template: impl.template,
      format: impl.format,
      isFrozen: impl.isFrozen,
      renderedText: impl.renderedText,
      renderError: impl.renderError,
    };
  }, _.isEqual);
  const { promptTemplates, promptTemplatesInitialLoadComplete } = useAIStore(
    (state) => ({
      promptTemplates: state.promptTemplates,
      promptTemplatesInitialLoadComplete:
        state.promptTemplatesInitialLoadComplete,
    }),
    _.isEqual,
  );
  const { canEditParams } = useShareCapabilities();
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
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
    sectionVariantId,
  );
  const resolvedSource = useMemo(
    () =>
      resolvePromptSectionSource(
        {
          format,
          promptTemplateId,
          template,
        },
        promptTemplates,
      ),
    [format, promptTemplateId, promptTemplates, template],
  );
  const isReadOnly =
    resolvedSource.isLinked || isFrozen || (isDeploymentMode && !canEditParams);
  const editorValue = resolvedSource.isLinked
    ? resolvedSource.templateText
    : value;
  const linkedTemplateName =
    resolvedSource.linkedTemplate?.name || promptTemplateId || "";
  const errorText = useMemo(() => {
    if (
      resolvedSource.linkedTemplateMissing &&
      promptTemplatesInitialLoadComplete
    ) {
      return "Linked prompt template could not be found.";
    }
    return renderError ?? "";
  }, [
    promptTemplatesInitialLoadComplete,
    renderError,
    resolvedSource.linkedTemplateMissing,
  ]);
  const linkedTemplateInfo = useMemo(() => {
    if (!resolvedSource.isLinked) {
      return "";
    }
    if (
      resolvedSource.linkedTemplateMissing &&
      !promptTemplatesInitialLoadComplete
    ) {
      return "Loading linked prompt template...";
    }
    if (resolvedSource.linkedTemplateMissing) {
      return "This section is linked to a prompt template that could not be loaded. Choose a different prompt template in section settings.";
    }
    return `Linked to prompt template "${linkedTemplateName}". Edit it in Project AI Settings or make a local copy in section settings.`;
  }, [
    linkedTemplateName,
    promptTemplatesInitialLoadComplete,
    resolvedSource.isLinked,
    resolvedSource.linkedTemplateMissing,
  ]);
  useEffect(() => {
    setViewMode("template");
  }, [sectionId]);
  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });
  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({
    language: resolvedSource.format === FormatEnum.Jinja ? "markdown" : null,
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
          callOpenAPI(
            setPromptTemplate({
              body: {
                projectConfigId,
                sectionId,
                template: nextTemplate,
                frontendOpId,
              },
            } as Parameters<typeof setPromptTemplate>[0]),
          ),
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
          {linkedTemplateInfo ? (
            <div
              data-testid={`prompt-linked-template-note-${sectionId}`}
              className="mx-2 mt-2 rounded-md border border-blue-200/80 bg-blue-50/80 px-2 py-1 text-[11px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200"
            >
              {linkedTemplateInfo}
            </div>
          ) : null}
          <CodeMirror
            maxHeight={editorMaxHeight}
            value={editorValue}
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
          previewText={renderedText}
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
  previewText,
  errorText,
}: {
  sectionId: string;
  previewText: string;
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
        {previewText || "No prompt rendered yet."}
      </pre>
    </div>
  );
}
