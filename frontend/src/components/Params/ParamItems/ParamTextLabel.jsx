import { useSectionInfos } from "state/definitions";

export function ParamTextLabel({ sectionId, paramInfoId }) {
  const name = useSectionInfos((x) => x.codeInfo[paramInfoId].name);

  function onClick() {
    document
      .getElementById(`${sectionId}-${paramInfoId}-ParamInput`)
      .focus({ preventScroll: true });
  }

  return (
    <p
      className="cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200"
      onClick={onClick}
    >
      {name}
    </p>
  );
}
