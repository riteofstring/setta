import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const manifest = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
const supplements = JSON.parse(
  readFileSync(
    new URL("./editor-license-sources.json", import.meta.url),
    "utf8",
  ),
);
const externalPackages = new Set(
  Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  }).filter(
    (name) => !/^(?:@codemirror\/|@lezer\/|@uiw\/|codemirror$)/.test(name),
  ),
);

export function externalWorkspaceDependency(id: string): boolean {
  const parts = id.split("/");
  return externalPackages.has(
    id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!,
  );
}

function packageDirectory(id: string): string {
  let directory = path.dirname(id);
  for (;;) {
    const candidate = path.join(directory, "package.json");
    if (
      existsSync(candidate) &&
      JSON.parse(readFileSync(candidate, "utf8")).name
    )
      return directory;
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error(`No package manifest for bundled module ${id}`);
    directory = parent;
  }
}

function packageNotice(directory: string): { identity: string; text: string } {
  const metadata = JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  const identity = `${metadata.name}@${metadata.version}`;
  const files = readdirSync(directory)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:$|[.-])/i.test(name))
    .sort();
  const texts = files.map(
    (name) =>
      `${name}\n\n${readFileSync(path.join(directory, name), "utf8").trim()}`,
  );
  const supplement = supplements[identity];
  if (supplement)
    texts.push(`Source: ${supplement.source}\n\n${supplement.text.trim()}`);
  if (!texts.length)
    throw new Error(`Missing license text for bundled ${identity}`);
  const text = texts.join("\n\n");
  return {
    identity,
    text: `${identity}\nLicense: ${metadata.license}\n\n${text}`,
  };
}

export function bundledEditorNotices(): Plugin {
  return {
    name: "setta-editor-notices",
    generateBundle() {
      const directories = new Set<string>();
      for (const id of this.getModuleIds()) {
        if (
          path.isAbsolute(id) &&
          id.includes("/node_modules/") &&
          !this.getModuleInfo(id)?.isExternal
        ) {
          directories.add(packageDirectory(id));
        }
      }
      const notices = [...directories]
        .map(packageNotice)
        .sort((a, b) => a.identity.localeCompare(b.identity));
      this.emitFile({
        type: "asset",
        fileName: "EDITOR-NOTICES.txt",
        source: `Setta bundled editor dependency notices\n\n${notices.map((notice) => notice.text).join("\n\n" + "=".repeat(72) + "\n\n")}\n`,
      });
    },
  };
}
