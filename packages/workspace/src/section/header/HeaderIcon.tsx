import { FaLayerGroup } from "react-icons/fa6";

// The reference's `HeaderIcon`, trimmed to the slice-reachable renderers: the package-owned
// group icon and the `gg-menu` fallback every unmapped kind receives. The per-application-type
// icon record, list-element index text, and other-project-config icon left with those features;
// host-kind icon registration is a Phase 2 registry decision.
const themedHeaderIconClassName =
  "text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] group-hover/group-section:text-[color:var(--setta-section-style-outline)]";
const defaultBlueHeaderIconClassName =
  "text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]";
const defaultGroupHeaderIconClassName =
  "[&_*]:!scale-120 text-setta-400 transition-colors group-hover/group-section:text-blue-600 dark:text-setta-500 dark:group-hover/group-section:text-[#0084ff]";

type HeaderIconProps = {
  isGroup: boolean;
  hasSectionStyleTheme: boolean;
};

export function HeaderIcon({ isGroup, hasSectionStyleTheme }: HeaderIconProps) {
  const themedIconClassName = hasSectionStyleTheme ? themedHeaderIconClassName : null;

  if (isGroup) {
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
