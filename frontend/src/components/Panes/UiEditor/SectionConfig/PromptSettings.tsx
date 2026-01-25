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
  route_set_prompt_inputs,
  route_set_prompt_template,
} from "utils/generatedEndpoints";
import { PromptFormatEnum, SectionTypeEnum } from "utils/generatedTypes";

type PromptSettingsProps = {
  sectionId: string;
};

const PROMPT_INPUTS_PLACEHOLDER = '{\n  "name": "Ada"\n}';

export function PromptSettings({ sectionId }: PromptSettingsProps) {
  useHydrateAgenticState();
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const canEdit = !isShareMode || canEditParams;

  const { template, format, inputs, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Prompt,
    );
    return {
      template: impl.template,
      format: impl.format,
      inputs: impl.inputs,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  const { promptTemplates } = useAIStore(
    (state) => ({
      promptTemplates: state.promptTemplates,
    }),
    _.isEqual,
  );

  const [templateText, setTemplateText] = useState(template);
  const [inputsText, setInputsText] = useState(JSON.stringify(inputs, null, 2));
  const [inputsError, setInputsError] = useState<string | null>(null);

  useEffect(() => {
    setTemplateText(template);
  }, [template]);

  useEffect(() => {
    setInputsText(JSON.stringify(inputs, null, 2));
    setInputsError(null);
  }, [inputs]);

  const isDisabled = isFrozen || !canEdit;
  const promptFormatOptions = useMemo(
    () => Object.values(PromptFormatEnum),
    [],
  );

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

  const matchedTemplate = useMemo(() => {
    return (
      promptTemplates.find(
        (entry) => entry.template === templateText && entry.format === format,
      ) ?? null
    );
  }, [format, promptTemplates, templateText]);

  const updatePromptTemplate = useCallback(
    (nextTemplate: string) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
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

  const updatePromptFormat = useCallback(
    (nextFormat: PromptFormatEnum) => {
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

  const updatePromptInputs = useCallback(
    (nextInputs: Record<string, string>) => {
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"PromptSection">(state, sectionId, {
            inputs: nextInputs,
          });
        },
        send: (frontendOpId) =>
          route_set_prompt_inputs({
            projectConfigId,
            sectionId,
            inputs: nextInputs,
            frontendOpId,
          }),
      });
    },
    [projectConfigId, sectionId],
  );

  const handleTemplateSelect = useCallback(
    (templateId: string | null) => {
      if (isDisabled || !templateId) {
        return;
      }
      const selected =
        promptTemplates.find((entry) => entry.id === templateId) ?? null;
      if (!selected) {
        return;
      }
      setTemplateText(selected.template);
      updatePromptTemplate(selected.template);
      if (selected.format !== format) {
        updatePromptFormat(selected.format);
      }
    },
    [
      format,
      isDisabled,
      promptTemplates,
      updatePromptFormat,
      updatePromptTemplate,
    ],
  );

  const handleTemplateChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextTemplate = event.target.value;
      setTemplateText(nextTemplate);
      if (isDisabled) {
        return;
      }
      updatePromptTemplate(nextTemplate);
    },
    [isDisabled, updatePromptTemplate],
  );

  const handleInputsChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextText = event.target.value;
      setInputsText(nextText);
      if (isDisabled) {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(nextText);
      } catch (_err) {
        setInputsError("Inputs must be valid JSON.");
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setInputsError("Inputs must be a JSON object.");
        return;
      }
      const entries = Object.entries(parsed as Record<string, unknown>);
      const nextInputs: Record<string, string> = {};
      for (const [key, value] of entries) {
        if (typeof value !== "string") {
          setInputsError("Inputs values must be strings.");
          return;
        }
        nextInputs[key] = value;
      }
      setInputsError(null);
      updatePromptInputs(nextInputs);
    },
    [isDisabled, updatePromptInputs],
  );

  const handleFormatChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextFormat = event.target.value as PromptFormatEnum;
      if (isDisabled || nextFormat === format) {
        return;
      }
      updatePromptFormat(nextFormat);
    },
    [format, isDisabled, updatePromptFormat],
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Prompt Template
        </p>
        <IdNameCombobox
          allItems={templateGroups}
          value={matchedTemplate?.id ?? null}
          small={false}
          onSelectedItemChange={handleTemplateSelect}
          placeholder="Apply a template (optional)"
          outerDivClasses="justify-center"
          isDisabled={isDisabled}
          selectedItemCanBeNull
        />
        {matchedTemplate?.description ? (
          <p className="text-[11px] text-setta-500 dark:text-setta-400">
            {matchedTemplate.description}
          </p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Template Text
        </p>
        <textarea
          value={templateText}
          onChange={handleTemplateChange}
          spellCheck="false"
          disabled={isDisabled}
          className="min-h-[120px] w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-3 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600"
          placeholder="Write a Jinja-style prompt..."
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Inputs JSON
        </p>
        <textarea
          value={inputsText}
          onChange={handleInputsChange}
          spellCheck="false"
          disabled={isDisabled}
          className="min-h-[110px] w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-3 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600"
          placeholder={PROMPT_INPUTS_PLACEHOLDER}
        />
        {inputsError ? (
          <p className="text-[11px] text-red-600 dark:text-red-400">
            {inputsError}
          </p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Format
        </p>
        <select
          value={format}
          onChange={handleFormatChange}
          disabled={isDisabled}
          className="h-8 rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300"
        >
          {promptFormatOptions.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
