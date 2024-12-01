import { Editable } from "components/Utils/Editable";
import C from "constants/constants.json";
import { getSectionType, getSectionVariant } from "state/actions/sectionInfos";
import { createParamSweepSectionName } from "state/actions/uiTypes/utils";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useNodeInternals, useSectionInfos } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { getIsSeriesElementHelper } from "state/hooks/uiTypes";

export function SectionTitle({ sectionId, titleProps }) {
  const { sectionName, titleIsEditable } = useTitleIsEditable(sectionId);

  if (titleIsEditable) {
    return (
      <EditableTitle
        sectionId={sectionId}
        sectionName={sectionName}
        titleProps={titleProps}
      />
    );
  }
  return <FixedTitle sectionName={sectionName} className={titleProps.fixed} />;
}

function FixedTitle({ sectionName, className }) {
  return <h2 className={className}>{sectionName}</h2>;
}

function EditableTitle({ sectionId, sectionName, titleProps }) {
  function onTitleInputChange(value) {
    setSectionName(sectionId, value, true);
  }

  function condition(value) {
    return !getSiblingHasName(sectionId, value);
  }

  const [inputValue, setInputValue, onBlur, onCancel] = useEditableOnSubmit(
    sectionName,
    onTitleInputChange,
    condition,
  );

  return (
    <Editable
      value={inputValue}
      onChange={setInputValue}
      onBlur={onBlur}
      onCancel={onCancel}
      titleProps={titleProps}
    />
  );
}

function setSectionName(sectionId, name, incrementVersion) {
  useSectionInfos.setState((x) => {
    const s = x.x[sectionId];
    s.name = name;
    if (s.paramSweepSectionId) {
      x.x[paramSweepSectionId].name = createParamSweepSectionName(name);
    }
  });
  maybeIncrementProjectStateVersion(incrementVersion);
}

function useTitleIsEditable(sectionId) {
  return useSectionInfos((x) => {
    const isUneditableType = [
      C.IMAGE,
      C.LINE_PLOT,
      C.GLOBAL_VARIABLES,
      C.PARAM_SWEEP,
      C.GLOBAL_PARAM_SWEEP,
    ].includes(getSectionType(sectionId, x));

    const isListElement = getIsSeriesElementHelper(sectionId, [C.LIST_ROOT], x);

    return {
      sectionName: x.x[sectionId].name,
      titleIsEditable: !isListElement && !isUneditableType,
    };
  });
}

function getSiblingHasName(sectionId, newName) {
  const state = useSectionInfos.getState();
  const { parentId } = state.x[sectionId];
  const siblingIds = parentId
    ? getSectionVariant(parentId).children
    : useNodeInternals.getState().x.keys();
  for (const s of siblingIds) {
    if (state.x[s].name === newName) {
      return true;
    }
  }
  return false;
}
