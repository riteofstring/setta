import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getEmptySpacePosition } from "state/actions/sections/createSections";
import { GoHTTPRouteHelpers } from "utils/generatedRoutes";
import { SectionTypeEnum } from "utils/generatedTypes";

type SettaApiPreset = {
  label: string;
  route: string;
  buildBody: () => Record<string, unknown>;
};

export const SETTA_API_PRESETS: Array<SettaApiPreset> = [
  {
    label: "Create top-level section",
    route: GoHTTPRouteHelpers.createTopLevelSection(),
    buildBody: () => {
      return {
        projectConfigId: getCurrProjectConfigId(),
        implType: SectionTypeEnum.TextBlock,
        controlCodeObjType: null,
        implOverrides: { type: SectionTypeEnum.TextBlock, text: "Hello" },
        position: getEmptySpacePosition(),
      };
    },
  },
  {
    label: "Get latest project state",
    route: GoHTTPRouteHelpers.getLatestProjectState(),
    buildBody: () => ({
      projectConfigId: getCurrProjectConfigId(),
    }),
  },
  {
    label: "Save project",
    route: GoHTTPRouteHelpers.saveProject(),
    buildBody: () => ({
      projectConfigId: getCurrProjectConfigId(),
    }),
  },
];

function getSettaApiPreset(route: string): SettaApiPreset | undefined {
  return SETTA_API_PRESETS.find((preset) => preset.route === route);
}

function buildSettaApiDefaultBody(
  route: string,
): Record<string, unknown> | null {
  const preset = getSettaApiPreset(route);
  if (!preset) {
    return null;
  }
  return preset.buildBody();
}

export function formatSettaApiBody(route: string): string {
  const body = buildSettaApiDefaultBody(route);
  if (!body) {
    return "";
  }
  return JSON.stringify(body, null, 2);
}

export function buildSettaApiPayload(
  route: string,
  rawBody: string,
): Record<string, unknown> {
  const trimmedBody = rawBody.trim();
  const userBody =
    trimmedBody === ""
      ? {}
      : (JSON.parse(trimmedBody) as Record<string, unknown>);
  const presetBody = buildSettaApiDefaultBody(route);
  if (!presetBody) {
    return userBody;
  }
  return { ...presetBody, ...userBody };
}
