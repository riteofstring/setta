import * as Dialog from "@radix-ui/react-dialog";
import BASE_UI_TYPES from "constants/BaseUITypes.json";
import { useEffect, useState } from "react";
import { HiOutlineDuplicate } from "react-icons/hi";
import { loadProjectState } from "state/actions/loadProjectState";
import { useExportProjectJson } from "state/hooks/useGetOrCreateProjects";
import { Footer } from "utils/Modals/SaveLoadModal/SaveLoadModal";

export function ExportJSONModal({ modalType, open }) {
  const { projectJson, exportProjectJson, exportFullProjectJson } =
    useExportProjectJson();

  useEffect(() => {
    if (open) {
      if (modalType === "Export JSON") {
        exportProjectJson();
      } else if (modalType === "Export Full JSON") {
        exportFullProjectJson();
      }
    }
  }, [open]);

  const value = JSON.stringify(projectJson, null, 2);

  return (
    <TextAreaModal
      value={value}
      title="Export JSON"
      copyBtn={true}
      onClickCopyBtn={() => navigator.clipboard.writeText(value)}
    />
  );
}

export function ImportJSONModal() {
  const [value, setValue] = useState("");

  async function onClick() {
    const parsed = JSON.parse(value);
    parsed.uiTypes = { ...parsed.uiTypes, ...BASE_UI_TYPES };
    loadProjectState(parsed);
  }

  return (
    <TextAreaModal
      value={value}
      setValue={setValue}
      title="Import JSON"
      disabled={false}
      buttonText={"Import"}
      onClick={onClick}
    />
  );
}

function TextAreaModal({
  value,
  setValue,
  title,
  disabled = true,
  copyBtn = false,
  onClickCopyBtn,
  buttonText = null,
  onClick,
}) {
  return (
    <div className="flex h-full flex-grow flex-col  ">
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-setta-400">
        {title}
      </Dialog.Title>
      <article className="relative flex flex-grow overflow-hidden rounded-lg border border-setta-100 bg-setta-50 p-4  dark:border-setta-700/50 dark:bg-setta-900 dark:text-setta-300">
        {copyBtn && (
          <HiOutlineDuplicate
            className="absolute right-8 top-4 h-5 w-5 cursor-pointer text-setta-300 hover:text-setta-600 dark:hover:text-white"
            onClick={onClickCopyBtn}
          />
        )}
        <textarea
          disabled={disabled}
          className="overflow-y flex-grow resize-none bg-transparent font-mono text-xs outline-none"
          value={value}
          onChange={(v) => setValue(v.target.value)}
          placeholder="JSON, state 'em..."
        />
      </article>
      <Footer buttonText={buttonText} onClick={onClick} />
    </div>
  );
}
