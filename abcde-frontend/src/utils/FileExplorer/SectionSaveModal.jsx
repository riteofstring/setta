import { getCollectionsAndModulesFn } from "dbRequests/sectionConfig";
import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useEffect, useState } from "react";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { SaveLoadModal } from "./SaveLoadModal";

export function SectionSaveModal({ sectionId, type, children }) {
  const files = useFiles(type);
  const onClickActionButton = useOnClickActionButton({ sectionId, type });

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
    >
      {children}
    </SaveLoadModal>
  );
}

function useFiles(type) {
  const [files, setFiles] = useState([]);

  const setCollectionsAsFiles = getCollectionsAndModulesFn((x) =>
    setFiles(Object.values(x).map((y) => y.name))
  );

  useEffect(() => {
    if (type === "Custom Arguments") {
      setCollectionsAsFiles();
    } else {
      setFiles([]);
    }
  }, [type]);

  return files;
}

function useOnClickActionButton({ sectionId, type }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");

  return (selected, filename) => {
    saveKwargsAsCollection({
      sectionId,
      objInfoId: selectedItem,
      name: filename,
    });
  };
}
