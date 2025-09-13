import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { SectionTypeEnum } from "utils/generatedTypes";

export function ImageAreaSettings({ sectionId }: { sectionId: string }) {
  const imagePath = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Image,
    );
    return impl.imagePath;
  });

  const [value, setValue] = useLocalPendingValue(imagePath);

  //  useProjectState.setState((x) => {
  //     setCurrEffectiveSectionImplValue<"ImageSection">(x, sectionId, {
  //       imagePath: e.target.value,
  //     });
  //   });

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
  }

  return (
    <div className="flex w-full items-center gap-3">
      <p className="select-none  text-sm font-bold text-setta-400 dark:text-setta-600">
        Image Path
      </p>
      <input
        className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
        value={value}
        onChange={onChange}
        // onBlur={(e) => onBlur(e.target.value)}
      />
    </div>
  );

  // return (
  //   <JustListOfArtifacts
  //     sectionId={sectionId}
  //     sectionTypeName={UITypeNameEnum.IMAGE}
  //   />
  // );
}
