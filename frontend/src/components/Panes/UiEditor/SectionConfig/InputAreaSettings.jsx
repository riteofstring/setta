import { useEffect, useState } from "react";
import { dbLoadSectionJSONSource } from "requests/sections";
import {
  addJSONSource,
  addJSONSourceMissing,
  removeJSONSource,
  removeJSONSourceMissing,
} from "state/actions/jsonSource";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/sections";

export function InputAreaSettings({ sectionId }) {
  const jsonSource = useGetSectionInfo(sectionId, "jsonSource");

  const [value, setValue] = useState(jsonSource ?? "");
  async function onBlur(e) {
    const jsonSource = e.target.value;
    setSectionInfoAttr({ sectionId, attr: "jsonSource", value: jsonSource });
    if (jsonSource) {
      const res = await dbLoadSectionJSONSource(jsonSource);
      if (res.status === 200) {
        const { newCodeInfos, newVariantValues, jsonSourceMissing } = res.data;
        if (jsonSourceMissing) {
          removeJSONSource(sectionId);
          addJSONSourceMissing(sectionId);
        } else {
          addJSONSource({ sectionId, newCodeInfos, newVariantValues });
          removeJSONSourceMissing(sectionId);
        }
      }
    } else {
      removeJSONSource(sectionId);
      removeJSONSourceMissing(sectionId);
    }
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
