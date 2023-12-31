import { useGetParamUIType } from "hooks/useParamUIType";
import { SLIDER, SWITCH } from "z_utils/constants";
import { SliderInput, SliderInputConfig } from "./SliderInput/SliderInput";
import { SwitchInput, SwitchInputConfig } from "./SwitchInput/SwitchInput";
import { TextInput, TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, ...props }) {
  switch (name) {
    default:
      return <TextInputConfig {...props} />;
    case SLIDER:
      return <SliderInputConfig {...props} />;
    case SWITCH:
      return <SwitchInputConfig {...props} />;
  }
}

export function ParamUI(props) {
  const uiType = useGetParamUIType(props.sectionId, props.paramInfoId);
  switch (uiType.type) {
    default:
      return <TextInput {...props} {...uiType.config} />;
    case SLIDER:
      return <SliderInput {...props} {...uiType.config} />;
    case SWITCH:
      return <SwitchInput {...props} {...uiType.config} />;
  }
}
