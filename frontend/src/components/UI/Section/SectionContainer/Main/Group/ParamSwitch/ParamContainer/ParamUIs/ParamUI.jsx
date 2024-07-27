import C from "constants/constants.json";
import { useGetParamUIType } from "state/hooks/useParamUIType";
import { SliderInput, SliderInputConfig } from "./SliderInput/SliderInput";
import { SwitchInput, SwitchInputConfig } from "./SwitchInput/SwitchInput";
import { TextInput, TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, ...props }) {
  switch (name) {
    default:
      return <TextInputConfig {...props} />;
    case C.SLIDER:
      return <SliderInputConfig {...props} />;
    case C.SWITCH:
      return <SwitchInputConfig {...props} />;
  }
}

export function ParamUI(props) {
  const uiType = useGetParamUIType(props.sectionId, props.paramInfoId);
  switch (uiType.type) {
    default:
      return <TextInput {...props} {...uiType.config} />;
    case C.SLIDER:
      return <SliderInput {...props} {...uiType.config} />;
    case C.SWITCH:
      return <SwitchInput {...props} {...uiType.config} />;
  }
}
