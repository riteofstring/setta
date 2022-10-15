import KwargParam from "./ParamSwitchOptions/KwargParam";
import RegularParam from "./ParamSwitchOptions/RegularParam";

export default function ParamSwitch(props) {
  return props.isKwarg ? (
    <KwargParam {...props} />
  ) : (
    <RegularParam {...props} />
  );
}
