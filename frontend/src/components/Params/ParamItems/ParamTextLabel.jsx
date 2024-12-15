import { useSectionInfos } from "state/definitions";

export function ParamTextLabel({ paramInfoId }) {
  const name = useSectionInfos((x) => x.codeInfo[paramInfoId].name);

  function onClick() {
    console.log("paramInfoId", paramInfoId);
  }

  return (
    <p
      className="truncate py-[.125rem] font-sans text-xs font-semibold  text-setta-800 dark:text-setta-200"
      onClick={onClick}
    >
      {name}
    </p>
  );
}
