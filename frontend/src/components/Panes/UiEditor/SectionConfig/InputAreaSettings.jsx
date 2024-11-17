import { useEffect, useState } from "react";
import { dbLoadSectionJSONSource } from "requests/sections";
import { addCodeInfoBatch } from "state/actions/codeInfo";
import { addCodeInfoColsBatch } from "state/actions/codeInfoCols";
import {
  setSectionInfoAttr,
  updateSections,
} from "state/actions/sections/sectionInfos";
import { updateSectionVariants } from "state/actions/sectionVariants";
import { useJSONSourceMissing } from "state/definitions";
import { useGetSectionInfo } from "state/hooks/sections";

export function InputAreaSettings({ sectionId }) {
  const jsonSource = useGetSectionInfo(sectionId, "jsonSource");

  const [value, setValue] = useState(jsonSource ?? "");
  async function onBlur(e) {
    const jsonSource = e.target.value;
    setSectionInfoAttr({ sectionId, attr: "jsonSource", value: jsonSource });
    let configLanguage = "python",
      jsonSourceMissing = false,
      codeInfo = null,
      codeInfoCols = null,
      sectionVariants = null,
      sections = null;
    if (jsonSource) {
      const res = await dbLoadSectionJSONSource(sectionId);
      if (res.status === 200) {
        ({ codeInfo, codeInfoCols, sectionVariants, sections } =
          res.data.project);
        ({ jsonSourceMissing } = res.data);
        configLanguage = "json";
      }
    }
    useJSONSourceMissing.setState({ [sectionId]: jsonSourceMissing });
    setSectionInfoAttr({
      sectionId,
      attr: "configLanguage",
      value: configLanguage,
    });
    if (codeInfo) addCodeInfoBatch(codeInfo);
    if (codeInfoCols) addCodeInfoColsBatch(codeInfoCols);
    if (sectionVariants) updateSectionVariants({ sectionVariants });
    if (sections) updateSections(sections);
  }

  useEffect(() => {
    setValue(jsonSource ?? "");
  }, [jsonSource]);

  return (
    <div className="mb-2 mt-2 w-full select-text">
      <div className="flex w-full items-center gap-3">
        <p className="select-none  text-sm font-bold text-setta-400 dark:text-setta-600">
          JSON Source
        </p>
        <input
          className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onBlur}
        />
      </div>
    </div>
  );
}
