import {
  Editable,
  EditableInput,
  EditablePreview,
  Input,
} from "@chakra-ui/react";
import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";

export default function SectionTitle({ heading, onTitleInputChange }) {
  const [inputValue, setInputValue, onSubmit] = useEditableOnSubmit(
    heading,
    onTitleInputChange
  );

  return (
    <Editable
      value={inputValue}
      onChange={setInputValue}
      isPreviewFocusable={true}
      onSubmit={onSubmit}
      fontFamily="Work Sans"
      fontWeight="bold"
      className="nodrag"
    >
      <EditablePreview />
      <Input
        as={EditableInput}
        paddingX="0.5rem"
        paddingY="0"
        marginLeft="-0.5rem"
        height="30px"
      />
    </Editable>
  );
}
