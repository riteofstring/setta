import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getSectionCore,
} from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import {
  isBaseParentSectionImpl,
  SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function SectionTitle({ sectionId, titleProps }: { sectionId: string }) {
  const { sectionName, titleIsEditable } = useTitleIsEditable(sectionId);

  if (titleIsEditable) {
    return (
      <EditableTitle
        sectionId={sectionId}
        sectionName={sectionName}
        titleProps={titleProps}
        {...getFloatingBoxHandlers({ title: sectionName })}
      />
    );
  }
  return (
    <FixedTitle
      sectionName={sectionName}
      className={titleProps.fixed}
      {...getFloatingBoxHandlers({ title: sectionName })}
    />
  );
}

function FixedTitle({ sectionName, className, onMouseEnter, onMouseLeave }) {
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

function EditableTitle({
  sectionId,
  sectionName,
  titleProps,
  onMouseEnter,
  onMouseLeave,
}) {
  function onTitleInputChange(value: string) {
    setSectionName(sectionId, value);
  }

  function condition(value: string) {
    return !getSiblingHasName(sectionId, value);
  }

  const [inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey] =
    useEditableOnSubmit(sectionName, onTitleInputChange, condition);

  return (
    <Editable
      value={inputValue}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      titleProps={titleProps}
      doubleClickToEdit={true}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      blurTriggeredByEscapeKey={blurTriggeredByEscapeKey}
    />
  );
}

function setSectionName(sectionId: string, name: string) {
  useProjectState.setState((x) => {
    const s = getSectionCore(x, sectionId);
    s.name = name;
    x.requestRenameRefactor = true;
  });
}

function useTitleIsEditable(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);

    const uneditableTypes: Array<SectionType> = [
      SectionTypeEnum.GlobalVariables,
      SectionTypeEnum.GenPythonCode,
    ];

    const s = getSectionCore(x, sectionId);

    return {
      sectionName: s.name,
      titleIsEditable: !uneditableTypes.includes(impl.type),
    };
  });
}

function getSiblingHasName(sectionId: string, newName: string) {
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const { parentId } = impl;
  let siblingIds: Iterable<string>;
  if (parentId) {
    const parentImpl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      parentId,
      isBaseParentSectionImpl,
    );
    siblingIds = parentImpl.children;
  } else {
    siblingIds = useNodeInternals.getState().x.keys();
  }
  for (const s of siblingIds) {
    if (state.sections[s]?.name === newName) {
      return true;
    }
  }
  return false;
}
