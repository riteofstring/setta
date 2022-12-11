import { Editable, EditableInput, EditablePreview } from "@chakra-ui/react";
import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionSiblingNames } from "hooks/useSectionSiblings";
import { useTitleIsEditable } from "hooks/useTitleIsEditable";
import { useSectionInfos } from "models/info/sectionInfos";

export default function SectionTitle({ sectionId, editableProps, inputProps }) {
  const [sectionName] = useGetSectionInfo(sectionId, ["name"]);
  const titleIsEditable = useTitleIsEditable(sectionId);

  if (titleIsEditable) {
    return (
      <EditableTitle
        sectionId={sectionId}
        sectionName={sectionName}
        editableProps={editableProps}
        inputProps={inputProps}
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

function EditableTitle({ sectionId, sectionName, editableProps, inputProps }) {
  const setSectionInfoAttr = useSectionInfos((x) => x.setSectionInfoAttr);
  const siblingNames = useSectionSiblingNames(sectionId);

  function onTitleInputChange(value) {
    setSectionInfoAttr({ sectionId, attr: "name", value });
  }

  const [inputValue, setInputValue, onSubmit] = useEditableOnSubmit(
    sectionName,
    onTitleInputChange,
    (v) => !siblingNames.has(v)
  );

  return (
    <Editable
      value={inputValue}
      onChange={setInputValue}
      onSubmit={onSubmit}
      {...editableProps}
    >
      <EditablePreview />
      <EditableInput {...inputProps} />
    </Editable>
  );
}
