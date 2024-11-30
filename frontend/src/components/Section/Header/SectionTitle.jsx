import { Editable } from "components/Utils/Editable";
import C from "constants/constants.json";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { getSectionSiblingNames } from "state/getters/sectionInfo";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { getIsSeriesElementHelper } from "state/hooks/uiTypes";
import { getParamSweepSectionName } from "utils/sectionTypeHelpers";

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
    const sibilingNames = getSectionSiblingNames(sectionId);
    return !sibilingNames.has(value);
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
      x.x[paramSweepSectionId].name = getParamSweepSectionName(name);
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
    ].includes(x.uiTypes[x.x[sectionId].uiTypeId].type);

    const isListElement = getIsSeriesElementHelper(sectionId, [C.LIST_ROOT], x);

    return {
      sectionName: x.x[sectionId].name,
      titleIsEditable: !isListElement && !isUneditableType,
    };
  });
}
