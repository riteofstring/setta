import * as Dialog from "@radix-ui/react-dialog";
import { dbGetSections, dbLoadSection } from "dbRequests/sections";
import {
  extractArgparseArgs,
  loadSectionIntoState,
} from "hooks/useCreateSectionOrDeck";
import { useEffect, useRef, useState } from "react";
import { Footer, SaveLoadModal } from "utils/SaveLoadModal/SaveLoadModal";

export function PaneContextMenuModal({
  modalType,
  open,
  setOpen,
  commonProps,
  children,
}) {
  const [sections, setSections] = useState([]);

  useEffect(() => {
    async function fn() {
      if (open && modalType === "Load Section") {
        const res = await dbGetSections();
        if (res.status === 200) {
          setSections([]); // TODO
        }
      }
    }
    fn();
  }, [open]);

  function renderModalContent() {
    if (modalType === "Create From Argparse") {
      return <CreateFromArgparseModal commonProps={commonProps} />;
    }
    return null;
  }

  const content = renderModalContent();

  async function onClickLoadSection({ selected }) {
    const res = await dbLoadSection({ sectionId: selected });
    if (res.status === 200) {
      loadSectionIntoState({
        ...res.data,
        ...commonProps,
        topLevelIds: [selected],
      });
    }
  }

  return (
    <SaveLoadModal
      modalType={"Load"}
      files={sections}
      title={"Load Section"}
      buttonText={"Load"}
      onClickActionButton={onClickLoadSection}
      open={open}
      setOpen={setOpen}
      content={content}
    >
      {children}
    </SaveLoadModal>
  );
}

function CreateFromArgparseModal({ commonProps }) {
  const textValue = useRef("");

  function onClick() {
    extractArgparseArgs({ pathToScript: textValue.current, ...commonProps });
  }

  return (
    <>
      <Dialog.Title className="mx-3 mb-4 font-bold uppercase tracking-widest text-slate-400">
        {"Create From Argparse"}
      </Dialog.Title>
      <article className="relative flex flex-grow overflow-hidden rounded-lg border border-runcoder-100 bg-runcoder-50 p-4  dark:border-runcoder-700/50 dark:bg-runcoder-900 dark:text-runcoder-300">
        <input
          className="overflow-y flex-grow resize-none bg-transparent font-mono text-xs outline-none"
          placeholder="path to python file"
          onChange={(e) => (textValue.current = e.target.value)}
        />
      </article>

      <Footer buttonText={"Create"} onClick={onClick} />
    </>
  );
}
