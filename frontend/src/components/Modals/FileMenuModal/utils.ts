import { useEffect } from "react";
import { loadAllProjectMetadata } from "state/actions/project/loadProject";
import { useAllProjectMetadata } from "state/definitions";

export function useProjectMetadataForFileMenu(open: boolean) {
  const projectMetadata = useAllProjectMetadata((x) => x.projectMetadata);
  useEffect(() => {
    if (open) {
      loadAllProjectMetadata();
    }
  }, [open]);

  return projectMetadata;
}
