import TextInput, { TextInputConfig } from "./TextInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import { NestedObjectInputConfig } from "./NestedObjectInput";

export function getParamUIConfig(uiType) {
  switch (uiType) {
    default:
      return TextInputConfig()
    case "SLIDER":
      return SliderInputConfig()
    case "NESTED_OBJECT":
    case "LIST_NESTED_OBJECT":
      return NestedObjectInputConfig()
  }
}

export default function getParamUI(uiType, childProps) {
  switch (uiType) {
    default:
      return <TextInput {...childProps} />;
    case "SLIDER":
      return <SliderInput {...childProps} />;
  }
}
