import { ParamContainer } from "./ParamContainer";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

export function RegularParam(props) {
  return (
    <ParamContainer {...props}>
      <ParamTextLabel {...props} />
    </ParamContainer>
  );
}
