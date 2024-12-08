import React from "react";
import { VersionList } from "./VersionList";

export const SectionVariants = React.forwardRef(({ sectionId }, ref) => {
  return <VersionList sectionId={sectionId} />;
});
