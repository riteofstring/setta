import { isAbsolute } from "node:path";

export function assertSettaSkillRootParams(roots) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error("skills/extraRoots/set missing extraRoots");
  }
  const hasSettaRoot = roots.some(
    (root) => typeof root === "string" && isAbsolute(root) && root.endsWith("/.codex/skills"),
  );
  if (!hasSettaRoot) {
    throw new Error(
      `skills/extraRoots/set missing Setta .codex/skills root: ${JSON.stringify(roots)}`,
    );
  }
}

export function assertCodexSkillRootsConfigured(configured) {
  if (!configured) {
    throw new Error("thread start/resume missing prior Codex skill root setup");
  }
}
