import TextInput, { TextInputConfig } from "./TextInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import { NestedObjectInputConfig } from "./NestedObjectInput";
import { useStoreState } from "easy-peasy";

export function ParamUIConfig({ uiType, onChange }) {
  const availableModules = useStoreState(
    (state) => state.master.availableModules
  );

  switch (uiType.name) {
    default:
      return <TextInputConfig uiType={uiType} onChange={onChange} />;
    case "SLIDER":
      return <SliderInputConfig uiType={uiType} onChange={onChange} />;
    case "NESTED_OBJECT":
    case "LIST_NESTED_OBJECT":
      return (
        <NestedObjectInputConfig
          uiType={uiType}
          onChange={onChange}
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
