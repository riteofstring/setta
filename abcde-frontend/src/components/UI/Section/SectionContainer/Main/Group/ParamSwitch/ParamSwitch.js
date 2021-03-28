import ParamContainer from "./ParamContainer/ParamContainer";
import ParamInput from "./ParamContainer/ParamItems/ParamInput";
import ParamTextLabel from "./ParamContainer/ParamItems/ParamTextLabel";

export default function ParamSwitch(props) {
  switch (props.uiType) {
    case "KWARGS":
      return (
        <ParamContainer {...props}>
          <ParamInput {...props} />
        </ParamContainer>
      );
    default:
      return (
        <ParamContainer {...props}>
          <ParamTextLabel {...props} />
        </ParamContainer>
      );
  }
}
