import TextInput from "./TextInput";
import SliderInput from "./SliderInput";

export default function getParamUI(uiType, childProps) {
  switch (uiType) {
    default:
      return <TextInput {...childProps} />;
    case "SLIDER":
      return <SliderInput {...childProps} />;
  }
}
