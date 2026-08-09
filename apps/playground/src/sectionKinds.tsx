import { registerSectionKinds, type WorkspaceSection } from "@setta/workspace";

// The host side of the registration seam: the package owns the shell, chrome, header, and
// resize treatment; the playground registers its one leaf kind and renders the section body
// from the kind's opaque data. No icon is registered, so headers keep the reference's
// gg-menu fallback glyph from the accepted side-by-side.

function getLeafBody(section: WorkspaceSection): string {
  const data = section.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Leaf section ${section.id} is missing its body data.`);
  }
  const body = data["body"];
  if (typeof body !== "string") {
    throw new Error(`Leaf section ${section.id} is missing its body text.`);
  }
  return body;
}

function LeafSectionBody({ section }: { section: WorkspaceSection }) {
  return (
    <div className="section-full-no-title px-1">
      <p className="text-xs text-setta-500 dark:text-setta-400">{getLeafBody(section)}</p>
    </div>
  );
}

// Loading validates every non-group kind against the registry, so registration precedes the
// initial document load. The default size is the accepted slice's 200 x 122 outer leaf
// geometry (200 x 122 content plus the shell's 1 px border on each side).
export function registerPlaygroundSectionKinds(): void {
  registerSectionKinds({
    leaf: {
      renderContent: (section) => <LeafSectionBody section={section} />,
      defaultSize: { width: 200, height: 122 },
    },
  });
}
