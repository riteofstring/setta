import { FaLayerGroup } from "react-icons/fa6";
import { GROUP_SECTION_KIND } from "../../document/documentSelectors";
import { getRegisteredSectionKindOrThrow } from "../../document/sectionKindRegistry";

// The reference's `HeaderIcon` over the section-kind registry: the package-owned group icon,
// the registered kind icon rendered with the reference's simple-icon treatment
// (`renderSimpleHeaderIcon`), and the `gg-menu` fallback every kind without an icon receives.
// The reference's per-application-type renderers (code language, text block, social, ...) are
// the application's to register.
const themedHeaderIconClassName =
  "text-[color:var(--setta-section-style-muted-text)] motion-safe:transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] group-hover/group-section:text-[color:var(--setta-section-style-outline)]";
const defaultBlueHeaderIconClassName =
  "text-setta-300 motion-safe:transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]";
const defaultGroupHeaderIconClassName =
  "[&_*]:!scale-120 text-setta-400 motion-safe:transition-colors group-hover/group-section:text-blue-600 dark:text-setta-500 dark:group-hover/group-section:text-[#0084ff]";

type HeaderIconProps = {
  sectionId: string;
  sectionKind: string;
  hasSectionStyleTheme: boolean;
};

export function HeaderIcon({
  sectionId,
  sectionKind,
  hasSectionStyleTheme,
}: HeaderIconProps) {
  const themedIconClassName = hasSectionStyleTheme
    ? themedHeaderIconClassName
    : null;

  if (sectionKind === GROUP_SECTION_KIND) {
    return (
      <FaLayerGroup
        className={
          themedIconClassName
            ? `[&_*]:!scale-120 ${themedIconClassName}`
            : defaultGroupHeaderIconClassName
        }
      />
    );
  }

  const RegisteredIcon = getRegisteredSectionKindOrThrow(sectionKind).icon;
  if (RegisteredIcon) {
    return (
      <RegisteredIcon
        className={themedIconClassName ?? defaultBlueHeaderIconClassName}
        sectionId={sectionId}
      />
    );
  }

  return (
    <i
      className={
        themedIconClassName
          ? `gg-menu group/card-section:hover:bg !scale-110 ${themedIconClassName}`
          : `gg-menu group/card-section:hover:bg !scale-110 ${defaultBlueHeaderIconClassName} `
      }
    />
  );
}
