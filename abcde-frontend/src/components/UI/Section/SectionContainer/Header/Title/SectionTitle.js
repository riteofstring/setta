import { Editable, EditableInput, EditablePreview } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionSiblingNames } from "hooks/useSectionSiblings";
import { useEffect } from "react";

export default function SectionTitle({ sectionId, editableProps, inputProps }) {
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

  useEffect(() => {
    if (sectionName !== inputValue) {
      setInputValue(sectionName);
    }
  }, [sectionName]);

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
