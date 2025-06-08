import _ from "lodash";
import { useProjectState } from "state/definitions";
import { UITypeNameEnum } from "utils/generatedTypes";

export function useCreateSectionsList() {
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const sectionGroupItems = [
    { name: "Section", specificProps: { type: UITypeNameEnum.SECTION } },
    { name: "List", specificProps: { type: UITypeNameEnum.LIST_ROOT } },
    { name: "Dict", specificProps: { type: UITypeNameEnum.DICT_ROOT } },
    { name: "Group", specificProps: { type: UITypeNameEnum.GROUP } },
    { name: "Text", specificProps: { type: UITypeNameEnum.TEXT_BLOCK } },
  ];

  if (!singletonSections[UITypeNameEnum.GLOBAL_VARIABLES]) {
    sectionGroupItems.push({
      name: "Global Variables",
      specificProps: { type: UITypeNameEnum.GLOBAL_VARIABLES },
    });
  }

  const codeGroupItems = [
    {
      name: "Python Code",
      specificProps: {
        type: UITypeNameEnum.CODE,
        sectionProps: { codeLanguage: "python" },
      },
    },
    {
      name: "Bash Script",
      specificProps: {
        type: UITypeNameEnum.CODE,
        sectionProps: { codeLanguage: "bash" },
      },
    },
    {
      name: "Terminal",
      specificProps: { type: UITypeNameEnum.TERMINAL },
    },
  ];

  if (!singletonSections[UITypeNameEnum.GEN_PYTHON_CODE]) {
    codeGroupItems.push({
      name: "Show Generated Python",
      specificProps: {
        type: UITypeNameEnum.GEN_PYTHON_CODE,
      },
    });
  }

  return [
    {
      group: "Section",
      items: sectionGroupItems,
    },
    {
      group: "Code",
      items: codeGroupItems,
    },
    {
      group: "Artifacts",
      items: [
        {
          name: "Drawing Area",
          specificProps: { type: UITypeNameEnum.DRAW },
        },
        { name: "Image", specificProps: { type: UITypeNameEnum.IMAGE } },
        { name: "Chart", specificProps: { type: UITypeNameEnum.CHART } },
        { name: "Chat", specificProps: { type: UITypeNameEnum.CHAT } },
        {
          name: "Browser",
          specificProps: { type: UITypeNameEnum.BROWSER },
        },
      ],
    },
    {
      group: "Embed",
      items: [
        {
          name: "Social",
          specificProps: { type: UITypeNameEnum.SOCIAL },
        },
        {
          name: "IFrame",
          specificProps: { type: UITypeNameEnum.IFRAME },
        },
      ],
    },
  ];
}
