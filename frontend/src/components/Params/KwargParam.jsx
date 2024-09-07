import { changeKwargName } from "state/actions/kwargs/kwargs";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, parentId, paramInfo: kwargInfo, setDidUpdate } = props;
  const onBlur = (v) => {
    changeKwargName({ sectionId, paramInfoId: kwargInfo.id, name: v });
  };

  const hasChildren = kwargInfo.children.length > 0;
  // className="section-w-full grid grid-cols-subgrid [&_>_.arg-close-btn]:hover:opacity-75 [&_>_.arg-pin-btn]:hover:bg-setta-200/50"
  return (
    <>
      <ParamContainer {...props} kwargInfo={kwargInfo}>
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={kwargInfo.id}
          value={kwargInfo.name}
          hasChildren={hasChildren}
          onBlur={onBlur}
          setDidUpdate={setDidUpdate}
        />
      </ParamContainer>
    </>
  );
}
