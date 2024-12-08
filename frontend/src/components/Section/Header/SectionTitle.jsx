import { Editable } from "components/Utils/Editable";
import { setSectionName } from "state/actions/sections/setters";
import { getSectionSiblingNames } from "state/getters/sectionInfo";
import {
  useEditableOnSubmit,
  useTitleIsEditable,
} from "state/hooks/editableText";
import { useGetSectionInfo } from "state/hooks/sections";

export function SectionTitle({ sectionId, titleProps }) {
  const sectionName = useGetSectionInfo(sectionId, "name");
  const titleIsEditable = useTitleIsEditable(sectionId);

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
