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

export default function SectionTitle({
  sectionId,
  editableProps,
  inputProps,
  isList,
}) {
  const { name: sectionName } = useGetSectionInfo(sectionId);
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

  if (!isList) {
    return (
      <EditableTitle
        inputValue={inputValue}
        setInputValue={setInputValue}
        onSubmit={onSubmit}
        editableProps={editableProps}
        inputProps={inputProps}
      />
    );
  }
  return <ListTitle inputValue={inputValue} />;
}

function ListTitle({ inputValue }) {
  return (
    <Text fontWeight="100" color="gray.400" as="i" userSelect="none">
      {inputValue}
    </Text>
  );
}

function EditableTitle({
  inputValue,
  setInputValue,
  onSubmit,
  editableProps,
  inputProps,
}) {
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
