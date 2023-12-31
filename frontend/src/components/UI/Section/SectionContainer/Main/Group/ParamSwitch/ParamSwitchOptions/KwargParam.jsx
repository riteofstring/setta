import { IoClose } from "react-icons/io5";
import { changeKwargName, deleteKwarg } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { ParamContainer } from "../ParamContainer/ParamContainer";
import { ParamNameInput } from "../ParamContainer/ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, objInfoId, paramInfo: kwargInfo } = props;
  const onBlur = (v) => {
    changeKwargName({ sectionId, paramInfoId: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg({
      sectionId,
      objInfoId,
      kwargId: kwargInfo.id,
      incrementVersion: true,
    });
  };

  return (
    <>
      <IconButton
        onClick={onClick}
        icon={<IoClose />}
        bg="bg-transparent"
        color="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        twClasses="card-close-arg-group place-self-center ml-1"
        padding=""
        size="h-[.66rem] w-[.66rem]"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </>
  );
}
