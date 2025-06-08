import _ from "lodash";
import { useProjectState } from "state/definitions";
import { UITypeNameSchema } from "utils/generatedTypes";

export function useCreateSectionsList() {
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const sectionGroupItems = [
    { name: "Section", specificProps: { type: UITypeNameSchema.enum.SECTION } },
    { name: "List", specificProps: { type: UITypeNameSchema.enum.LIST_ROOT } },
    { name: "Dict", specificProps: { type: UITypeNameSchema.enum.DICT_ROOT } },
    { name: "Group", specificProps: { type: UITypeNameSchema.enum.GROUP } },
    { name: "Text", specificProps: { type: UITypeNameSchema.enum.TEXT_BLOCK } },
  ];

  if (!singletonSections[UITypeNameSchema.enum.GLOBAL_VARIABLES]) {
    sectionGroupItems.push({
      name: "Global Variables",
      specificProps: { type: UITypeNameSchema.enum.GLOBAL_VARIABLES },
    });
  }

  const codeGroupItems = [
    {
      name: "Python Code",
      specificProps: {
        type: UITypeNameSchema.enum.CODE,
        sectionProps: { codeLanguage: "python" },
      },
    },
    {
      name: "Bash Script",
      specificProps: {
        type: UITypeNameSchema.enum.CODE,
        sectionProps: { codeLanguage: "bash" },
      },
    },
    {
      name: "Terminal",
      specificProps: { type: UITypeNameSchema.enum.TERMINAL },
    },
  ];

  if (!singletonSections[UITypeNameSchema.enum.GEN_PYTHON_CODE]) {
    codeGroupItems.push({
      name: "Show Generated Python",
      specificProps: {
        type: UITypeNameSchema.enum.GEN_PYTHON_CODE,
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
          specificProps: { type: UITypeNameSchema.enum.DRAW },
        },
        { name: "Image", specificProps: { type: UITypeNameSchema.enum.IMAGE } },
        { name: "Chart", specificProps: { type: UITypeNameSchema.enum.CHART } },
        { name: "Chat", specificProps: { type: UITypeNameSchema.enum.CHAT } },
        {
          name: "Browser",
          specificProps: { type: UITypeNameSchema.enum.BROWSER },
        },
      ],
    },
    {
      group: "Embed",
      items: [
        {
          name: "Social",
          specificProps: { type: UITypeNameSchema.enum.SOCIAL },
        },
        {
          name: "IFrame",
          specificProps: { type: UITypeNameSchema.enum.IFRAME },
        },
      ],
    },
  ];
}
