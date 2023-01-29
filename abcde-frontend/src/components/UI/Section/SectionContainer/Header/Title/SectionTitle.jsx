import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionSiblingNames } from "hooks/useSectionSiblings";
import { useTitleIsEditable } from "hooks/useTitleIsEditable";
import { useSectionInfos } from "models/info/sectionInfos";
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
    <p className="font-thin text-gray-400 italic select-none">{sectionName}</p>
  );
}

function EditableTitle({ sectionId, sectionName, titleProps }) {
  const setSectionInfoAttr = useSectionInfos((x) => x.setSectionInfoAttr);
  const siblingNames = useSectionSiblingNames(sectionId);

  function onTitleInputChange(value) {
    setSectionInfoAttr({ sectionId, attr: "name", value });
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
