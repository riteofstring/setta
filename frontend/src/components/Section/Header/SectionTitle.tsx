import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getSectionChildren,
  getSectionCore,
} from "state/actions/sectionInfos";
import {
  useNameValidationErrors,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useShareCapabilities } from "state/hooks/share";
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
  function onTitleInputChange(value: string) {
    setSectionName(sectionId, value);
  }

  function condition(value: string) {
    const validationError = getSectionNameValidationError(sectionId, value);
    return validationError === null;
  }

  const { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey } =
    useEditableOnSubmit(sectionName, onTitleInputChange, condition);
  const validationError = getSectionNameValidationError(sectionId, inputValue);
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
    <>
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
        <p className="mt-0.5 text-[10px] text-red-500">{validationError}</p>
      )}
    </>
  );
}

function setSectionName(sectionId: string, name: string) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const section = state.sections[sectionId];
      if (!section) {
        return;
      }
      section.name = name;
    },
    send: (frontendOpId) =>
      route_set_section_name({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        name,
        frontendOpId,
      }),
  });
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

function getSiblingHasName(sectionId: string, newName: string) {
  const state = useProjectState.getState();
  const parentId = state.parentSectionMap[sectionId];
  let siblingIds: Iterable<string>;
  if (parentId) {
    siblingIds = getSectionChildren(state, parentId);
  } else {
    siblingIds = useNodeInternals.getState().x.keys();
  }
  const normalized = newName.trim();
  for (const s of siblingIds) {
    if (s === sectionId) {
      continue;
    }
    const siblingName = state.sections[s]?.name?.trim();
    if (siblingName && siblingName === normalized) {
      return true;
    }
  }
  return false;
}

function getSectionNameValidationError(
  sectionId: string,
  value: string,
): string | null {
  const formatError = validateSectionNameInput(value);
  if (formatError) {
    return formatError;
  }
  if (getSiblingHasName(sectionId, value)) {
    return "Duplicate sibling name.";
  }
  return null;
}
