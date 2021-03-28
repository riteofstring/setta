import { Editable, EditablePreview, EditableInput } from "@chakra-ui/react";

export default function ParamNameInput({ onSubmit }) {
  return (
    <Editable
      placeholder="enter keyword"
      onSubmit={onSubmit}
    >
      <EditablePreview />
      <EditableInput />
    </Editable>
  );
}
