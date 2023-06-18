import { useGetSectionTypeConfig } from "hooks/useSectionType";
import React from "react";
import { SocialEmbeds } from "utils/embeds/socialembeds";

function _SocialArea({ sectionId }) {
  const type = useGetSectionTypeConfig(sectionId, "social");
  return <SocialEmbeds sectionId={sectionId} type={type} />;
}

export const SocialArea = React.memo(_SocialArea);
