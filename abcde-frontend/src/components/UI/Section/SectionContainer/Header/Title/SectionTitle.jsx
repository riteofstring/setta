import {
  Editable,
  EditableInput,
  EditablePreview,
  Text,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionSiblingNames } from "hooks/useSectionSiblings";
import { useTitleIsEditable } from "hooks/useTitleIsEditable";

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
    <Text fontWeight="100" color="gray.400" as="i" userSelect="none">
      {sectionName}
    </Text>
  );
}

function EditableTitle({ sectionId, sectionName, editableProps, inputProps }) {
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );
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
