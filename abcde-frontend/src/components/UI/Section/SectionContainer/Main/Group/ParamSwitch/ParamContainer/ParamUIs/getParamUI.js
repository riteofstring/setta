import TextInput, { TextInputConfig } from "./TextInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";

export function getParamUIConfig(uiType) {
  switch (uiType) {
    default:
      return TextInputConfig()
    case "SLIDER":
      return SliderInputConfig()
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
