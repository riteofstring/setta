import { useSectionInfos } from "state/definitions";

export function ParamTextLabel({ paramInfoId }) {
  const name = useSectionInfos((x) => x.codeInfo[paramInfoId].name);

  return (
    <p className="section-key truncate py-[.125rem] font-sans text-xs font-semibold  text-setta-800 dark:text-setta-200">
      {name}
    </p>
  );
}
