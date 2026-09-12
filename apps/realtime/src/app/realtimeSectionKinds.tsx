import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSection,
  registerSectionKinds,
  type SectionKindDefinition,
  type WorkspaceCodeSectionData,
  type WorkspaceHost,
} from "@setta/workspace";

import { ButtonSection } from "../sections/ButtonSection";
import { DrawingInspector } from "../sections/DrawingInspector";
import { DrawingSection } from "../sections/DrawingSection";
import { EntrypointCodeControl } from "../sections/EntrypointCodeControl";
import { InputSection } from "../sections/InputSection";
import { HandlerInspector } from "../sections/HandlerInspector";
import { HandlerSection } from "../sections/HandlerSection";
import { OutputSection } from "../sections/OutputSection";
import { StatusSection } from "../sections/StatusSection";
import { assertHandlerSectionData } from "../sections/sectionData";

type RealtimeSectionKind =
  | "input"
  | "output"
  | "button"
  | "status"
  | "drawing"
  | "handler"
  | typeof WORKSPACE_CODE_SECTION_KIND;

export type RealtimeSectionKindCatalog = Record<
  RealtimeSectionKind,
  SectionKindDefinition
>;

export function createRealtimeSectionKinds(
  onSubmit?: (sectionId: string, data: WorkspaceCodeSectionData) => void,
): RealtimeSectionKindCatalog {
  return {
    [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
      languages: ["python"],
      onSubmit,
      renderHeaderControls: (section) => (
        <EntrypointCodeControl section={section} />
      ),
    }),
    button: {
      defaultSize: { height: 112, width: 240 },
      nestedSections: "vertical",
      renderContent: (section) => <ButtonSection section={section} />,
    },
    drawing: {
      contentClassName: "flex min-h-0 flex-col",
      defaultSize: { height: 480, width: 640 },
      nestedSections: "vertical",
      renderContent: (section) => <DrawingSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <DrawingInspector
            data={context.section.data}
            isMinimized={context.section.isMinimized}
            positionAndSizeLocked={context.section.positionAndSizeLocked}
            sectionId={context.section.id}
          />
        ) : null,
    },
    handler: {
      assertValidData: (section) => assertHandlerSectionData(section.data),
      contentClassName: "flex min-h-0 flex-col",
      defaultSize: { height: 190, width: 300 },
      nestedSections: "vertical",
      renderContent: (section) => <HandlerSection section={section} />,
      renderInspector: (context) =>
        context.type === "section" ? (
          <HandlerInspector data={context.section.data} />
        ) : null,
    },
    input: {
      defaultSize: { height: 128, width: 320 },
      nestedSections: "vertical",
      renderContent: (section) => <InputSection section={section} />,
    },
    output: {
      defaultSize: { height: 240, width: 360 },
      nestedSections: "vertical",
      renderContent: (section) => <OutputSection section={section} />,
    },
    status: {
      defaultSize: { height: 128, width: 320 },
      nestedSections: "vertical",
      renderContent: (section) => <StatusSection section={section} />,
    },
  };
}

export function registerRealtimeSectionKinds(
  host: WorkspaceHost,
  catalog: RealtimeSectionKindCatalog,
): void {
  registerSectionKinds(host, catalog);
}
