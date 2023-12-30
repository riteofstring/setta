import { useEffect, useState } from "react";
import { DialogCloseButton } from "utils/atoms/dialog/dialogCloseButton";
import { ModalContainer } from "utils/ModalContainer/ModalContainer";
import { FileExplorer } from "../FileExplorer/FileExplorer";
import { FileNameInput } from "../FileExplorer/FileNameInput";

export function SaveLoadModal({
  modalType,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
  open,
  setOpen,
  children,
  content,
}) {
  const _content = content ?? (
    <ModalContent
      modalType={modalType}
      files={files}
      onClickActionButton={onClickActionButton}
      title={title}
      buttonText={buttonText}
      placeholder={placeholder}
      setOpen={setOpen}
    />
  );

  return (
    <ModalContainer open={open} setOpen={setOpen} content={_content}>
      {children}
    </ModalContainer>
  );
}

function ModalContent({
  modalType,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
  setOpen,
}) {
  const [selected, setSelected] = useState(null);
  const [folder, setFolder] = useState(null);
  const [filename, setFilename] = useState("");
  const [currFiles, setCurrFiles] = useState(files);
  const [breadCrumb, setBreadCrumb] = useState([]);

  useEffect(() => {
    setCurrFiles(files);
  }, [files]);

  function getFilenameFromId(id) {
    return files.find((f) => f.id === id)?.name ?? "";
  }

  function onFolderDoubleClick(id) {
    if (id === null) {
      setCurrFiles(files);
      setBreadCrumb([]);
    } else {
      setCurrFiles(getFolderContents({ files, folder: id }));
      setBreadCrumb(getBreadCrumb({ files, folder: id }));
    }
    setFolder(id);
  }

  function onFilenameChange(v) {
    setFilename(v);
    setSelected(files.find((f) => f.name === v)?.id ?? null);
  }

  function onSelectedChange(v) {
    setSelected(v);
    setFilename(getFilenameFromId(v));
  }

  function onClose() {
    setSelected(null);
    setFolder(null);
    setFilename("");
  }

  function onButtonClick() {
    onClickActionButton({ selected, folder, filename });
    onClose();
  }

  function onFileDoubleClick(id) {
    onClickActionButton({ selected: id, filename: getFilenameFromId(id) });
    setOpen(false);
    onClose();
  }

  function onBreadCrumbClick(idx) {
    onFolderDoubleClick(breadCrumb[idx].id);
  }

  return (
    <div className="grid flex-grow grid-rows-[min-content_min-content_1fr_min-content] overflow-hidden">
      <Body
        modalType={modalType}
        files={currFiles}
        selected={selected}
        onSelectedChange={onSelectedChange}
        onFolderDoubleClick={onFolderDoubleClick}
        onFileDoubleClick={onFileDoubleClick}
        onFilenameChange={onFilenameChange}
        filename={filename}
        title={title}
        placeholder={placeholder}
        breadCrumb={breadCrumb}
        onBreadCrumbClick={onBreadCrumbClick}
      />
      <Footer
        buttonText={buttonText}
        onClose={onClose}
        onClick={onButtonClick}
      />
    </div>
  );
}

function Body({
  modalType,
  files,
  selected,
  onSelectedChange,
  onFolderDoubleClick,
  onFileDoubleClick,
  onFilenameChange,
  filename,
  title,
  placeholder,
  breadCrumb,
  onBreadCrumbClick,
}) {
  return (
    <>
      <FileExplorer
        files={files}
        selected={selected}
        onSelectedChange={onSelectedChange}
        onFolderDoubleClick={onFolderDoubleClick}
        onFileDoubleClick={onFileDoubleClick}
        title={title}
        breadCrumb={breadCrumb}
        onBreadCrumbClick={onBreadCrumbClick}
      />
      {modalType !== "Load" && (
        <div className="px-3">
          <FileNameInput
            placeholder={placeholder}
            value={filename}
            onChange={onFilenameChange}
          />
        </div>
      )}
    </>
  );
}

export function Footer({ onClose, onClick, buttonText }) {
  return (
    <div className="mb-2 mt-4 flex justify-end gap-2">
      {buttonText && (
        <DialogCloseButton
          twClasses="bg-slate-200 dark:bg-runcoder-800 hover:bg-slate-300 dark:hover:bg-runcoder-900 text-slate-600 dark:text-runcoder-200 hover:cursor-pointer"
          onClick={onClick}
        >
          {buttonText}
        </DialogCloseButton>
      )}

      <DialogCloseButton
        twClasses="border border-solid border-slate-200 dark:border-runcoder-800 text-slate-400 hover:border-slate-500 hover:text-slate-600 dark:hover:text-runcoder-200 dark:hover:bg-runcoder-900 hover:cursor-pointer"
        onClick={onClose}
      >
        Close
      </DialogCloseButton>
    </div>
  );
}

function getFolderContents({ files, folder }) {
  const idx = files.findIndex((f) => f.id == folder);
  const depthAtIdx = files[idx].depth;
  const contents = [];
  for (const f of files.slice(idx + 1)) {
    if (f.depth > depthAtIdx) {
      contents.push({ ...f, depth: f.depth - 1 });
    } else {
      break;
    }
  }
  return contents;
}

function getBreadCrumb({ files, folder }) {
  let parents = [];
  for (const f of files) {
    const depth = f.depth;
    if (parents[depth]) {
      parents = parents.slice(0, depth);
    }
    parents[depth] = { id: f.id, name: f.name };
    if (f.id === folder) {
      break;
    }
  }
  parents.unshift({ id: null, name: "All Files" });
  return parents;
}
