import { createFile } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useEffect, useState } from "react";
import { updateProjectState } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useFileExists } from "state/hooks/utils";
import { res200 } from "utils/endpointUtils";

// TODO: enable this stuff again, but it should show jsonSourceGlob I guess
export function InputAreaSettings({ sectionId }) {
  const { fileExists, debouncedCheckIfFileExists } = useFileExists(200);

  const jsonSource = useProjectState((x) => x.sections[sectionId].jsonSource);

  const [value, setValue] = useState(jsonSource ?? "");

  function onChange(e) {
    setValue(e.target.value);
    debouncedCheckIfFileExists(e.target.value);
  }

  async function onBlur(jsonSource) {
    const { sections, variants, codeInfo, codeInfoCols } =
      await loadJsonContents({ [sectionId]: jsonSource });
    useProjectState.setState((state) => {
      state.sections[sectionId].jsonSource = jsonSource;
      updateProjectState({
        sections,
        variants,
        codeInfo,
        codeInfoCols,
        state,
      });
    });
  }

  useEffect(() => {
    setValue(jsonSource ?? "");
    debouncedCheckIfFileExists(jsonSource);
  }, [jsonSource]);

  async function onClickCreateJSON() {
    if (value) {
      const res = await callOpenAPI(
        createFile({
          body: {
            filepath: value,
          },
        }),
      );
      if (res200(res)) {
        onBlur(value);
      }
    }
  }

  return (
    <div className="mb-2 mt-2 w-full select-text">
      <div className="flex w-full items-center gap-3">
        <p className="select-none  text-sm font-bold text-setta-400 dark:text-setta-600">
          JSON Source
        </p>
        <input
          className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={value}
          onChange={onChange}
          onBlur={(e) => onBlur(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <button
          disabled={fileExists}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onClick={onClickCreateJSON}
        >
          Create JSON File
        </button>
      </div>
    </div>
  );
}
