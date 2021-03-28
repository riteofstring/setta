import { Editable, EditablePreview, EditableInput } from "@chakra-ui/react";

export default function ParamNameInput({ value, onSubmit }) {

  return (
    <Editable
      placeholder="enter keyword"
      value={value}
      onSubmit={onSubmit}
    >
      <EditablePreview />
      <EditableInput />
    </Editable>
  );
}
