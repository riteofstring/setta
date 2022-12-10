import { useCodeInfo } from "models/info/codeInfo";
import { AiOutlineClose } from "react-icons/ai";
import { deleteKwarg } from "thunks/kwargs";
import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";

export default function KwargParam(props) {
  const { sectionId, objInfoId, paramInfo: kwargInfo } = props;
  const setName = useCodeInfo((x) => x.setName);
  const onBlur = (v) => {
    setName({ id: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg({ sectionId, objInfoId, kwargId: kwargInfo.id });
  };

  return (
    <div className="flex">
      <button
        className="nodrag rounded-full bg-gray-100 hover:bg-gray-300"
        onClick={onClick}
      >
        <AiOutlineClose />
      </button>
      <ParamContainer {...props}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </div>
  );
}
