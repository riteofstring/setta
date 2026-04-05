import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_set_prompt_format,
  route_set_prompt_template,
  route_set_prompt_template_link,
} from "utils/generatedEndpoints";
import { FormatEnum, SectionTypeEnum } from "utils/generatedTypes";
import { resolvePromptSectionSource } from "utils/promptSectionSource";

type PromptSettingsProps = {
  sectionId: string;
};

export function PromptSettings({ sectionId }: PromptSettingsProps) {
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const canEdit = !isDeploymentMode || canEditParams;

  const { promptTemplateId, template, format, isFrozen } = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Prompt,
      );
      return {
        promptTemplateId: impl.promptTemplateId ?? null,
        template: impl.template,
        format: impl.format,
        isFrozen: impl.isFrozen,
      };
    },
    _.isEqual,
  );

  const { promptTemplates, promptTemplatesInitialLoadComplete } = useAIStore(
    (state) => ({
      promptTemplates: state.promptTemplates,
      promptTemplatesInitialLoadComplete:
        state.promptTemplatesInitialLoadComplete,
    }),
    _.isEqual,
  );

  const resolvedSource = useMemo(
    () =>
      resolvePromptSectionSource(
        {
          promptTemplateId,
          template,
          format,
        },
        promptTemplates,
      ),
    [format, promptTemplateId, promptTemplates, template],
  );
  const isLinked = resolvedSource.isLinked;
  const isDisabled = isFrozen || !canEdit;
  const linkedTemplateDescription =
    resolvedSource.linkedTemplate?.description ?? "";

  const [templateText, setTemplateText] = useState(resolvedSource.templateText);

  useEffect(() => {
    setTemplateText(resolvedSource.templateText);
  }, [resolvedSource.templateText]);

  const promptFormatOptions = useMemo(() => Object.values(FormatEnum), []);

  const templateGroups = useMemo(
    () => [
      {
        group: "Prompt Templates",
        items: promptTemplates.map((entry) => ({
          id: entry.id,
          name: entry.name || entry.id,
        })),
      },
    ],
    [promptTemplates],
  );

  const updatePromptTemplate = useCallback(
    (nextTemplate: string) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
            promptTemplateId: null,
            template: nextTemplate,
          });
        },
        send: (frontendOpId) =>
          route_set_prompt_template({
            projectConfigId,
            sectionId,
            template: nextTemplate,
            frontendOpId,
          }),
      });
    },
    [projectConfigId, sectionId],
  );

  const updatePromptTemplateLink = useCallback(
    (nextPromptTemplateId: string | null) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          const selectedTemplate =
            nextPromptTemplateId === null
              ? null
              : promptTemplates.find(
                  (entry) => entry.id === nextPromptTemplateId,
                ) ?? null;
          setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
            promptTemplateId: nextPromptTemplateId,
            template: selectedTemplate?.template ?? resolvedSource.templateText,
            format: selectedTemplate?.format ?? resolvedSource.format,
          });
        },
        send: (frontendOpId) =>
          route_set_prompt_template_link({
            projectConfigId,
            sectionId,
            promptTemplateId: nextPromptTemplateId,
            frontendOpId,
          }),
      });
    },
    [
      projectConfigId,
      promptTemplates,
      resolvedSource.format,
      resolvedSource.templateText,
      sectionId,
    ],
  );

  const updatePromptFormat = useCallback(
    (nextFormat: FormatEnum) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
            format: nextFormat,
          });
        },
        send: (frontendOpId) =>
          route_set_prompt_format({
            projectConfigId,
            sectionId,
            format: nextFormat,
            frontendOpId,
          }),
      });
    },
    [projectConfigId, sectionId],
  );

  const handleTemplateLinkChange = useCallback(
    (nextPromptTemplateId: string | null) => {
      if (isDisabled) {
        return;
      }
      updatePromptTemplateLink(nextPromptTemplateId);
    },
    [isDisabled, updatePromptTemplateLink],
  );

  const handleTemplateChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextTemplate = event.target.value;
      setTemplateText(nextTemplate);
      if (isDisabled || isLinked) {
        return;
      }
      updatePromptTemplate(nextTemplate);
    },
    [isDisabled, isLinked, updatePromptTemplate],
  );

  const handleFormatChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextFormat = event.target.value as FormatEnum;
      if (isDisabled || isLinked || nextFormat === format) {
        return;
      }
      updatePromptFormat(nextFormat);
    },
    [format, isDisabled, isLinked, updatePromptFormat],
  );

  const handleMakeLocalCopy = useCallback(() => {
    if (isDisabled || !resolvedSource.linkedTemplate) {
      return;
    }
    setTemplateText(resolvedSource.templateText);
    updatePromptTemplateLink(null);
  }, [
    isDisabled,
    resolvedSource.linkedTemplate,
    resolvedSource.templateText,
    updatePromptTemplateLink,
  ]);

  const linkedTemplateInfo = useMemo(() => {
    if (!isLinked) {
      return "";
    }
    if (
      resolvedSource.linkedTemplateMissing &&
      !promptTemplatesInitialLoadComplete
    ) {
      return "Loading linked prompt template...";
    }
    if (resolvedSource.linkedTemplateMissing) {
      return "This section is linked by id to a prompt template that could not be loaded. Choose a new template to repair the link.";
    }
    const linkedTemplateName =
      resolvedSource.linkedTemplate?.name || promptTemplateId || "";
    return `This section is linked by id to prompt template "${linkedTemplateName}". Edit the template in Project AI Settings, or make a local copy to edit here.`;
  }, [
    isLinked,
    promptTemplateId,
    promptTemplatesInitialLoadComplete,
    resolvedSource.linkedTemplate,
    resolvedSource.linkedTemplateMissing,
  ]);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Linked Prompt Template
        </p>
        <IdNameCombobox
          allItems={templateGroups}
          value={promptTemplateId}
          small={false}
          onSelectedItemChange={handleTemplateLinkChange}
          placeholder="Link a prompt template (optional)"
          outerDivClasses="justify-center"
          isDisabled={isDisabled}
          selectedItemCanBeNull
        />
        {linkedTemplateDescription ? (
          <p className="text-[11px] text-setta-500 dark:text-setta-400">
            {linkedTemplateDescription}
          </p>
        ) : null}
        {linkedTemplateInfo ? (
          <div className="rounded-md border border-blue-200/80 bg-blue-50/80 px-3 py-2 text-[11px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
            {linkedTemplateInfo}
          </div>
        ) : null}
        {isLinked && resolvedSource.linkedTemplate ? (
          <button
            type="button"
            className="self-start rounded-md border border-setta-200 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            disabled={isDisabled}
            onClick={handleMakeLocalCopy}
          >
            Make Local Copy
          </button>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Template Text
        </p>
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          Template text is also editable directly in the section body.
        </p>
        <textarea
          value={templateText}
          onChange={handleTemplateChange}
          spellCheck="false"
          disabled={isDisabled || isLinked}
          className="min-h-[120px] w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-3 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600"
          placeholder="Write a Jinja-style prompt..."
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Format
        </p>
        <select
          value={resolvedSource.format}
          onChange={handleFormatChange}
          disabled={isDisabled || isLinked}
          className="h-8 rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300"
        >
          {promptFormatOptions.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        {isLinked ? (
          <p className="text-[11px] text-setta-500 dark:text-setta-400">
            Linked prompt templates control the format.
          </p>
        ) : null}
      </div>
    </div>
  );
}
