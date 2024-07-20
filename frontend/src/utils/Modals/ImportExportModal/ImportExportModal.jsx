import * as Dialog from "@radix-ui/react-dialog";
import { dbGetBaseUITypes } from "dbRequests/uiTypes";
import { useExportProjectJson } from "hooks/useGetOrCreateProjects";
import { useEffect, useState } from "react";
import { HiOutlineDuplicate } from "react-icons/hi";
import { loadProjectState } from "thunks/loadProjectState";
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
    const res = await dbGetBaseUITypes();
    if (res.status === 200) {
      parsed.uiTypes = { ...parsed.uiTypes, ...res.data };
      loadProjectState(parsed);
    }
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
    <div className="flex min-h-[70vh] flex-grow flex-col  ">
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-runcoder-400">
        {title}
      </Dialog.Title>
      <article className="relative flex flex-grow overflow-hidden rounded-lg border border-runcoder-100 bg-runcoder-50 p-4  dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
        {copyBtn && (
          <HiOutlineDuplicate
            className="absolute right-8 top-4 h-5 w-5 cursor-pointer text-runcoder-300 hover:text-runcoder-600 dark:hover:text-white"
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
