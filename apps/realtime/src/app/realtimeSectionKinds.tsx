import {
  registerSectionKinds,
  type SectionKindDefinition,
  type WorkspaceHost,
} from "@setta/workspace";

import { ButtonSection } from "../sections/ButtonSection";
import { DrawingSection } from "../sections/DrawingSection";
import { InputSection } from "../sections/InputSection";
import { OutputSection } from "../sections/OutputSection";
import { StatusSection } from "../sections/StatusSection";

export type RealtimeSectionKind =
  "input" | "output" | "button" | "status" | "drawing";

export type RealtimeSectionKindCatalog = Record<
  RealtimeSectionKind,
  SectionKindDefinition
>;

export function createRealtimeSectionKinds(): RealtimeSectionKindCatalog {
  return {
    button: {
      defaultSize: { height: 112, width: 240 },
      nestedSections: "vertical",
      renderContent: (section) => <ButtonSection section={section} />,
    },
    drawing: {
      defaultSize: { height: 480, width: 640 },
      nestedSections: "vertical",
      renderContent: (section) => <DrawingSection section={section} />,
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
