import {
  registerSectionKinds,
  type SectionKindDefinition,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  CandidateInspector,
  CandidateSection,
} from "../sections/CandidateSection";
import { CaseSetInspector, CaseSetSection } from "../sections/CaseSetSection";
import {
  EvaluatorInspector,
  EvaluatorSection,
} from "../sections/EvaluatorSection";
import { CandidateIcon, CasesIcon, ChecksIcon } from "../sections/SectionIcons";
import { readBenchSectionData } from "../sections/sectionData";

export const BENCH_CASE_SET_SECTION_KIND = "bench.case-set";
export const BENCH_CANDIDATE_SECTION_KIND = "bench.candidate";
export const BENCH_EVALUATOR_SECTION_KIND = "bench.evaluator";

type BenchSectionKindCatalog = Record<
  | typeof BENCH_CASE_SET_SECTION_KIND
  | typeof BENCH_CANDIDATE_SECTION_KIND
  | typeof BENCH_EVALUATOR_SECTION_KIND,
  SectionKindDefinition
>;

function createBenchSectionKinds(): BenchSectionKindCatalog {
  return {
    [BENCH_CASE_SET_SECTION_KIND]: {
      assertValidData: (section) => readBenchSectionData(section.data),
      contentClassName: "bench-section-body",
      defaultSize: { height: 148, width: 300 },
      icon: CasesIcon,
      renderContent: (section) => <CaseSetSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <CaseSetInspector data={context.section.data} />
        ) : null,
      sizeConstraints: {
        maxHeight: 800,
        maxWidth: 800,
        minHeight: 120,
        minWidth: 240,
      },
    },
    [BENCH_CANDIDATE_SECTION_KIND]: {
      assertValidData: (section) => readBenchSectionData(section.data),
      contentClassName: "bench-section-body",
      defaultSize: { height: 164, width: 320 },
      icon: CandidateIcon,
      renderContent: (section) => <CandidateSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <CandidateInspector data={context.section.data} />
        ) : null,
      sizeConstraints: {
        maxHeight: 800,
        maxWidth: 900,
        minHeight: 136,
        minWidth: 260,
      },
    },
    [BENCH_EVALUATOR_SECTION_KIND]: {
      assertValidData: (section) => readBenchSectionData(section.data),
      contentClassName: "bench-section-body",
      defaultSize: { height: 176, width: 310 },
      icon: ChecksIcon,
      renderContent: (section) => <EvaluatorSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <EvaluatorInspector data={context.section.data} />
        ) : null,
      sizeConstraints: {
        maxHeight: 900,
        maxWidth: 800,
        minHeight: 140,
        minWidth: 260,
      },
    },
  };
}

export function registerBenchSectionKinds(host: WorkspaceHost): void {
  registerSectionKinds(host, createBenchSectionKinds());
}
