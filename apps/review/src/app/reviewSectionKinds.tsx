import {
  registerSectionKinds,
  type WorkspaceHost,
  type WorkspaceSection,
  type WorkspaceSectionSearchableText,
} from "@setta/workspace";

import { ArtifactChoiceSection } from "../sections/ArtifactChoiceSection";
import { ArtifactSection } from "../sections/ArtifactSection";
import { ChoiceMatrixSection } from "../sections/ChoiceMatrixSection";
import { ClaimsSection } from "../sections/ClaimsSection";
import { EvidenceSection } from "../sections/EvidenceSection";
import {
  REVIEW_ARTIFACT_CHOICE_SECTION_KIND,
  REVIEW_ARTIFACT_SECTION_KIND,
  REVIEW_CHOICE_SECTION_KIND,
  REVIEW_CLAIMS_SECTION_KIND,
  REVIEW_EVIDENCE_SECTION_KIND,
} from "./reviewProjection";

const searchableSectionText: WorkspaceSectionSearchableText = (section) => {
  return section.name;
};

export function registerReviewSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, {
    [REVIEW_ARTIFACT_CHOICE_SECTION_KIND]: {
      contentClassName: "review-section-content",
      defaultSize: { height: "auto", width: 440 },
      getSectionSearchableText: searchableSectionText,
      renderContent: (section) => <ArtifactChoiceSection section={section} />,
    },
    [REVIEW_ARTIFACT_SECTION_KIND]: {
      contentClassName:
        "review-section-content review-artifact-section-content",
      defaultSize: { height: 470, width: 430 },
      getSectionSearchableText: searchableSectionText,
      renderContent: (section) => <ArtifactSection section={section} />,
    },
    [REVIEW_CHOICE_SECTION_KIND]: {
      contentClassName: "review-section-content review-choice-section-content",
      defaultSize: { height: "auto", width: 760 },
      getSectionSearchableText: searchableSectionText,
      renderContent: (section) => <ChoiceMatrixSection section={section} />,
    },
    [REVIEW_CLAIMS_SECTION_KIND]: {
      contentClassName: "review-section-content",
      defaultSize: { height: "auto", width: 560 },
      getSectionSearchableText: searchableSectionText,
      renderContent: (section) => <ClaimsSection section={section} />,
    },
    [REVIEW_EVIDENCE_SECTION_KIND]: {
      contentClassName:
        "review-section-content review-evidence-section-content",
      defaultSize: { height: 360, width: 480 },
      getSectionSearchableText: searchableSectionText,
      renderContent: (section) => <EvidenceSection section={section} />,
    },
  });
}
