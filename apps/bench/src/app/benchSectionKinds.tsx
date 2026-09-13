import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSection,
  registerSectionKinds,
  type SectionKindDefinition,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  CandidateHeaderControls,
  CandidateInspector,
} from "../sections/CandidateSection";
import {
  CaseSetInspector,
  CaseSetSection,
  CaseSetSummary,
} from "../sections/CaseSetSection";
import {
  EvaluatorInspector,
  EvaluatorSection,
  EvaluatorSummary,
} from "../sections/EvaluatorSection";
import { CasesIcon, ChecksIcon } from "../sections/SectionIcons";
import { readBenchSectionData } from "../sections/sectionData";
import { benchItemSearchableText } from "./benchSectionProjection";

export const BENCH_CASE_SET_SECTION_KIND = "bench.case-set";
export const BENCH_CANDIDATE_SECTION_KIND = WORKSPACE_CODE_SECTION_KIND;
export const BENCH_EVALUATOR_SECTION_KIND = "bench.evaluator";

type BenchSectionKindCatalog = Record<
  | typeof BENCH_CASE_SET_SECTION_KIND
  | typeof BENCH_CANDIDATE_SECTION_KIND
  | typeof BENCH_EVALUATOR_SECTION_KIND,
  SectionKindDefinition
>;

type OrdinarySectionKindDefinition = Extract<
  SectionKindDefinition,
  { presentation?: undefined }
>;

function createBenchSectionKinds(): BenchSectionKindCatalog {
  const candidateKind = createWorkspaceCodeSection({
    defaultSize: { height: 220, width: 360 },
    languages: ["bash"],
    renderHeaderControls: (section) => (
      <CandidateHeaderControls section={section} />
    ),
    renderInspector: (context) =>
      context.type === "section" ? (
        <CandidateInspector candidateId={context.section.id} />
      ) : null,
  }) as OrdinarySectionKindDefinition;
  return {
    [BENCH_CASE_SET_SECTION_KIND]: {
      assertValidData: (section) => readBenchSectionData(section.data),
      contentClassName: "bench-section-body",
      defaultSize: { height: 420, width: 360 },
      getItemSearchableText: ({ item }) => benchItemSearchableText(item),
      icon: CasesIcon,
      itemArea: {
        renderLeadingContent: (section) => <CaseSetSummary section={section} />,
        toolbar: "filter-only",
      },
      renderContent: (section) => <CaseSetSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <CaseSetInspector data={context.section.data} />
        ) : null,
      sizeConstraints: {
        maxHeight: 800,
        maxWidth: 800,
        minHeight: 180,
        minWidth: 300,
      },
    },
    [BENCH_CANDIDATE_SECTION_KIND]: {
      ...candidateKind,
      sizeConstraints: {
        maxHeight: 700,
        maxWidth: 900,
        minHeight: 180,
        minWidth: 300,
      },
    },
    [BENCH_EVALUATOR_SECTION_KIND]: {
      assertValidData: (section) => readBenchSectionData(section.data),
      contentClassName: "bench-section-body",
      defaultSize: { height: 420, width: 360 },
      getItemSearchableText: ({ item }) => benchItemSearchableText(item),
      icon: ChecksIcon,
      itemArea: {
        renderLeadingContent: (section) => (
          <EvaluatorSummary section={section} />
        ),
        toolbar: "hidden",
      },
      renderContent: (section) => <EvaluatorSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <EvaluatorInspector data={context.section.data} />
        ) : null,
      sizeConstraints: {
        maxHeight: 900,
        maxWidth: 800,
        minHeight: 180,
        minWidth: 300,
      },
    },
  };
}

export function registerBenchSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, createBenchSectionKinds());
}
