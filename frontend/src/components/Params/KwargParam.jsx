import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { changeKwargName, deleteKwarg } from "state/actions/kwargs/kwargs";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, parentId, paramInfo: kwargInfo } = props;
  const onBlur = (v) => {
    changeKwargName({ sectionId, paramInfoId: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg({
      sectionId,
      parentId,
      kwargId: kwargInfo.id,
      incrementVersion: true,
    });
  };

  const hasChildren = kwargInfo.children.length > 0;

  return (
    <>
      <IconButton
        onClick={onClick}
        icon={<i className="gg-close" />}
        bg="bg-transparent"
        color="text-setta-200 dark:text-setta-600 hover:text-setta-500 dark:hover:text-setta-200"
        twClasses={`section-left-gutter ${kwargInfo.children.length > 0 ? "self-start justify-self-center mt-[0.6rem]" : "place-self-center"}  z-20 -ml-[0.125rem]`}
        padding=""
        size="h-[.5rem] w-[.5rem]"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={kwargInfo.id}
          value={kwargInfo.name}
          hasChildren={hasChildren}
          onBlur={onBlur}
          onClick={props.onNameClick}
        />
      </ParamContainer>
    </>
  );
}
