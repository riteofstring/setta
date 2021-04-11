import TextInput, { TextInputConfig } from "./TextInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import { NestedObjectInputConfig } from "./NestedObjectInput";
import { useStoreState } from "easy-peasy";

export function ParamUIConfig({ uiType, childProps }) {
  const availableModules = useStoreState(
    (state) => state.master.availableModules
  );

  switch (uiType) {
    default:
      return <TextInputConfig {...childProps} />;
    case "SLIDER":
      return <SliderInputConfig {...childProps} />;
    case "NESTED_OBJECT":
    case "LIST_NESTED_OBJECT":
      return (
        <NestedObjectInputConfig
          {...childProps}
          availableModules={availableModules}
        />
      );
  }
}

export default function ParamUI({ uiType, childProps }) {
  switch (uiType.name) {
    default:
      return <TextInput {...childProps} />;
    case "SLIDER":
      return <SliderInput {...childProps} />;
  }
}
