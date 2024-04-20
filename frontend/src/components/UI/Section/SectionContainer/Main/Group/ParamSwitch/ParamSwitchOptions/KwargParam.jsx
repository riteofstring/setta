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
        icon={<i className="gg-close" />}
        bg="bg-transparent"
        color="text-runcoder-400 dark:text-runcoder-700 hover:text-runcoder-700 dark:hover:text-runcoder-200"
        twClasses="card-close-arg-group place-self-center ml-1 z-20"
        padding=""
        size="h-[.66rem] w-[.66rem]"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </>
  );
}
