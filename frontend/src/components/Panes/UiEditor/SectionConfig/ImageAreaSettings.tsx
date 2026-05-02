import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { setImageAreaImagePath } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
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
  function onSetImagePath(newImagePath: string) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ImageSection">(state, sectionId, {
          imagePath: newImagePath,
        });
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setImageAreaImagePath({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              imagePath: newImagePath,
              frontendOpId,
            },
          } as Parameters<typeof setImageAreaImagePath>[0]),
        ),
    });
  }
  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    imagePath,
    onSetImagePath,
    () => true,
    true,
  );
  return (
    <div className="flex w-full items-center gap-3">
      <p className="select-none  text-sm font-bold text-setta-400 dark:text-setta-600">
        Image Path
      </p>
      <input
        className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
