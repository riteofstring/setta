import { ParamContainer } from "./ParamContainer";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

export function RegularParam(props) {
  return (
    <ParamContainer {...props}>
      <ParamTextLabel paramInfoId={props.paramInfoId} />
    </ParamContainer>
  );
}
