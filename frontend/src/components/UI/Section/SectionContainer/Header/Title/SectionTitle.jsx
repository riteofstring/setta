import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionSiblingNames } from "hooks/useSectionSiblings";
import { useTitleIsEditable } from "hooks/useTitleIsEditable";
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
  const siblingNames = useSectionSiblingNames(sectionId);

  function onTitleInputChange(value) {
    setSectionName(sectionId, value, true);
  }

  const [inputValue, setInputValue, onBlur, onCancel] = useEditableOnSubmit(
    sectionName,
    onTitleInputChange,
    (v) => !siblingNames.has(v)
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
