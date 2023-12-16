import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useTitleIsEditable } from "hooks/useTitleIsEditable";
import { getSectionSiblingNames } from "thunks/sections/getters";
import { setSectionName } from "thunks/sections/setters";
import { Editable } from "utils/Editable/Editable";

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
  return <FixedTitle sectionName={sectionName} />;
}

function FixedTitle({ sectionName }) {
  return (
    <h2 className="select-none font-thin italic text-slate-400">
      {sectionName}
    </h2>
  );
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
    condition
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
