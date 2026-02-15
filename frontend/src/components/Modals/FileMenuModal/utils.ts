import _ from "lodash";
import { useEffect } from "react";
import { loadAllProjectMetadata } from "state/actions/project/loadProject";
import { useAllProjectMetadata } from "state/definitions";

export function useProjectMetadataForFileMenu(open: boolean) {
  const projectMetadata = useAllProjectMetadata(
    (x) => x.projectMetadata,
    _.isEqual,
  );
  useEffect(() => {
    if (open) {
      loadAllProjectMetadata();
    }
  }, [open]);

  return projectMetadata;
}
