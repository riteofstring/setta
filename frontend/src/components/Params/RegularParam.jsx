import { ParamContainer } from "./ParamContainer";
import { ParamTextLabel } from "./ParamItems/ParamTextLabel";

export function RegularParam(props) {
  return (
    <ParamContainer {...props} isKwarg={false}>
      <ParamTextLabel {...props} />
    </ParamContainer>
  );
}
