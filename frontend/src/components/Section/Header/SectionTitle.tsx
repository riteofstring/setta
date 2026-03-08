import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useEffect, useState } from "react";
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
import {
  sanitizeNameForPythonIdentifier,
  sanitizeNameForSlug,
  validateSectionNameInput,
} from "utils/nameValidation";
import {
  collectDescendantSectionIds,
  getSectionSlugIndex as getCachedSectionSlugIndex,
  getReservedStandaloneSectionSlugError,
  resolveSectionFullPathName,
} from "utils/sectionSlugPaths";

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
    useEditableOnSubmit(
      sectionName,
      onTitleInputChange,
      condition,
      false,
      (value) => value.trim(),
    );
  const formatError = validateSectionNameInput(inputValue);
  let siblingError: string | null = null;
  if (!formatError && getSiblingHasName(sectionId, inputValue)) {
    siblingError = "Duplicate sibling name.";
  }
  const identifierError =
    !formatError && !siblingError
      ? getTopLevelPythonIdentifierConflictError(sectionId, inputValue)
      : null;
  const [slugError, setSlugError] = useState<string | null>(null);
  useEffect(() => {
    if (formatError || siblingError || identifierError) {
      setSlugError(null);
      return;
    }
    if (!inputValue.trim()) {
      setSlugError(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setSlugError(getSectionSlugConflictError(sectionId, inputValue));
    }, 200);
    return () => {
      window.clearTimeout(handle);
    };
  }, [formatError, identifierError, inputValue, sectionId, siblingError]);
  const validationError =
    formatError ?? siblingError ?? identifierError ?? slugError;
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

function setSectionName(sectionId: string, name: string) {
  const normalizedName = name.trim();
  const previousName =
    useProjectState.getState().sections[sectionId]?.name ?? "";
  dispatchOptimisticProjectStateUpdate({
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

function getSectionSlugConflictError(sectionId: string, value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const state = useProjectState.getState();
  if (!state.sections[sectionId]) {
    return null;
  }
  const nameOverrides = { [sectionId]: normalized };
  const { slugToIds, childrenByParent } = getCachedSectionSlugIndex(state);
  const affectedIds = collectDescendantSectionIds(childrenByParent, sectionId);
  const affectedSlugToIds: Record<string, Array<string>> = {};
  for (const id of affectedIds) {
    const fullPathName = resolveSectionFullPathName(state, id, nameOverrides);
    const slug = sanitizeNameForSlug(fullPathName);
    if (!slug) {
      return "Section name is invalid after sanitization.";
    }
    const reservedSlugError = getReservedStandaloneSectionSlugError(slug);
    if (reservedSlugError) {
      return reservedSlugError;
    }
    if (!affectedSlugToIds[slug]) {
      affectedSlugToIds[slug] = [];
    }
    affectedSlugToIds[slug].push(id);
  }
  for (const [slug, ids] of Object.entries(affectedSlugToIds)) {
    if (ids.length > 1) {
      return `Section path slug "${slug}" conflicts with another section.`;
    }
    const existingIds = slugToIds[slug] ?? [];
    if (existingIds.some((id) => !affectedIds.has(id))) {
      return `Section path slug "${slug}" conflicts with another section.`;
    }
  }
  return null;
}

function getTopLevelPythonIdentifierConflictError(
  sectionId: string,
  value: string,
) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const state = useProjectState.getState();
  if (state.parentSectionMap[sectionId]) {
    return null;
  }
  const candidate = sanitizeNameForPythonIdentifier(normalized);
  for (const [id, parentId] of Object.entries(state.parentSectionMap)) {
    if (parentId || id === sectionId) {
      continue;
    }
    const siblingName = state.sections[id]?.name?.trim();
    if (!siblingName) {
      continue;
    }
    if (sanitizeNameForPythonIdentifier(siblingName) === candidate) {
      return "Section name conflicts with another top-level name after Python identifier sanitization.";
    }
  }
  return null;
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
  const identifierError = getTopLevelPythonIdentifierConflictError(
    sectionId,
    value,
  );
  if (identifierError) {
    return identifierError;
  }
  const slugError = getSectionSlugConflictError(sectionId, value);
  if (slugError) {
    return slugError;
  }
  return null;
}
