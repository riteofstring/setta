import ParamContainer from "./ParamContainer/ParamContainer";
import ParamInput from "./ParamContainer/ParamItems/ParamInput";
import ParamTextLabel from "./ParamContainer/ParamItems/ParamTextLabel";

export default function ParamSwitch(props) {
  const tempKwargs = "KWARGS";
  switch (tempKwargs) {
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
