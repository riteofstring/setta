import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type { ChangeEvent } from "react";
import { useState } from "react";
import {
  dispatchOptimisticProjectStateUpdateWithResult,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getSectionCore,
} from "state/actions/sectionInfos";
import { useNameValidationErrors, useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useShareCapabilities } from "state/hooks/share";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_set_section_name } from "utils/generatedEndpoints";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";
import { validateSectionNameInput } from "utils/nameValidation";

type SectionTitleClassNames = {
  editing?: string;
  notEditing?: string;
  fixed?: string;
};

type SectionTitleProps = {
  sectionId: string;
  titleProps: SectionTitleClassNames;
};

export function SectionTitle({ sectionId, titleProps }: SectionTitleProps) {
  const { sectionName, titleIsEditable } = useTitleIsEditable(sectionId);
  const backendErrors = useNameValidationErrors(
    (state) => state.sectionErrors[sectionId],
  );
  const backendErrorMessage = backendErrors?.join("\n") ?? "";
  const hasBackendError = backendErrorMessage.length > 0;
  let errorClassName = "";
  if (hasBackendError) {
    errorClassName = "text-red-500 dark:text-red-300 border-red-400";
  }
  const mergedTitleProps = {
    ...titleProps,
    editing: titleProps.editing
      ? `${titleProps.editing} ${errorClassName}`
      : titleProps.editing,
    notEditing: titleProps.notEditing
      ? `${titleProps.notEditing} ${errorClassName}`
      : titleProps.notEditing,
    fixed: titleProps.fixed
      ? `${titleProps.fixed} ${errorClassName}`
      : titleProps.fixed,
  };
  const tooltipContentArray = hasBackendError
    ? [
        {
          title: "Invalid name",
          content: backendErrorMessage,
          wrapperClassName:
            "!border-red-300 dark:!border-red-900 [&_.tooltip-footer]:!text-red-500 dark:[&_.tooltip-footer]:!text-red-800 dark:[&_.tooltip-footer]:!border-red-950 !bg-red-50/90 dark:!bg-[#120000]/90 [&_.tooltip-copy]:!text-red-400 dark:[&_.tooltip-copy]:!text-red-300 [&>.tooltip-copy]:hover:!bg-transparent",
          contentClassName: "!text-red-700 dark:!text-red-300 font-mono",
        },
        { title: sectionName },
      ]
    : [{ title: sectionName }];

  if (titleIsEditable) {
    return (
      <EditableTitle
        sectionId={sectionId}
        sectionName={sectionName}
        titleProps={mergedTitleProps}
        {...getFloatingBoxHandlers(...tooltipContentArray)}
      />
    );
  }
  return (
    <FixedTitle
      sectionName={sectionName}
      className={mergedTitleProps.fixed}
      {...getFloatingBoxHandlers(...tooltipContentArray)}
    />
  );
}

type FixedTitleProps = {
  sectionName: string;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function FixedTitle({
  sectionName,
  className,
  onMouseEnter,
  onMouseLeave,
}: FixedTitleProps) {
  return (
    <h2
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {sectionName}
    </h2>
  );
}

type EditableTitleProps = {
  sectionId: string;
  sectionName: string;
  titleProps: SectionTitleClassNames;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function EditableTitle({
  sectionId,
  sectionName,
  titleProps,
  onMouseEnter,
  onMouseLeave,
}: EditableTitleProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const normalizeName = (value: string) => value.trim();

  async function condition(value: string) {
    const normalized = normalizeName(value);
    const validationError = validateSectionNameInput(normalized);
    if (validationError) {
      setServerError(null);
      return false;
    }
    const response = await renameSection(sectionId, normalized);
    if (res200(response)) {
      setServerError(null);
      return true;
    }
    setServerError(getErrorDetail(response.data) ?? "Unable to rename section.");
    return false;
  }

  const editable = useEditableOnSubmit(
    sectionName,
    () => {},
    condition,
    false,
    normalizeName,
  );
  function onChange(event: ChangeEvent<HTMLInputElement> | string) {
    setServerError(null);
    editable.onChange(event);
  }
  const {
    inputValue,
    onBlur,
    onKeyDown,
    blurTriggeredByEscapeKey,
  } = editable;
  const formatError = validateSectionNameInput(inputValue);
  const validationError = formatError ?? serverError;
  let localErrorClassName = "";
  if (validationError) {
    localErrorClassName = "text-red-500 dark:text-red-300 border-red-400";
  }
  const mergedTitleProps = {
    ...titleProps,
    editing: titleProps.editing
      ? `${titleProps.editing} ${localErrorClassName}`
      : titleProps.editing,
    notEditing: titleProps.notEditing
      ? `${titleProps.notEditing} ${localErrorClassName}`
      : titleProps.notEditing,
  };

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <Editable
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        titleProps={mergedTitleProps}
        doubleClickToEdit={true}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        blurTriggeredByEscapeKey={blurTriggeredByEscapeKey}
      />
      {validationError && (
        <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 max-w-[220px] whitespace-pre-line rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-medium leading-snug text-red-700 shadow-sm dark:border-red-900 dark:bg-[#120000] dark:text-red-200">
          <span className="absolute -top-1 left-3 h-2 w-2 rotate-45 border-l border-t border-red-300 bg-red-50 dark:border-red-900 dark:bg-[#120000]" />
          {validationError}
        </div>
      )}
    </div>
  );
}

async function renameSection(sectionId: string, normalizedName: string) {
  const previousName =
    useProjectState.getState().sections[sectionId]?.name ?? "";
  const { result } = dispatchOptimisticProjectStateUpdateWithResult({
    apply: (state) => {
      const section = state.sections[sectionId];
      if (!section) {
        return;
      }
      section.name = normalizedName;
    },
    rollback: (state) => {
      const section = state.sections[sectionId];
      if (!section) {
        return;
      }
      if (section.name !== normalizedName) {
        return;
      }
      section.name = previousName;
    },
    send: (frontendOpId) =>
      route_set_section_name({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        name: normalizedName,
        frontendOpId,
      }),
  });
  return await result;
}

function useTitleIsEditable(sectionId: string) {
  const { canEditStructure } = useShareCapabilities();
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);

    const uneditableTypes: Array<SectionType> = [
      SectionTypeEnum.GlobalVariables,
      SectionTypeEnum.GenPythonCode,
      SectionTypeEnum.GenPythonMetadata,
    ];

    const s = getSectionCore(x, sectionId);

    return {
      sectionName: s.name,
      titleIsEditable: canEditStructure && !uneditableTypes.includes(impl.type),
    };
  });
}
