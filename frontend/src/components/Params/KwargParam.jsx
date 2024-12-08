import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, paramInfoId } = props;

  // className="section-w-full grid grid-cols-subgrid [&_>_.arg-close-btn]:hover:opacity-75 [&_>_.arg-pin-btn]:hover:bg-setta-200/50"
  return (
    <>
      <ParamContainer {...props}>
        <ParamNameInput sectionId={sectionId} paramInfoId={paramInfoId} />
      </ParamContainer>
    </>
  );
}
