import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_setta_home_info,
  route_reveal_path_in_os_file_explorer,
} from "utils/generatedEndpoints";
import { type AppGenSkillEntry } from "utils/generatedTypes";
import {
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

type PathGroupHeaderProps = {
  title: string;
  path: string;
  onCopyPath: (path: string) => void;
  onRevealPath: (path: string) => void;
};

function isActionablePath(path: string): boolean {
  const normalizedPath = path.trim().toLowerCase();
  return normalizedPath !== "" && normalizedPath !== "unavailable";
}

function PathGroupHeader({
  title,
  path,
  onCopyPath,
  onRevealPath,
}: PathGroupHeaderProps) {
  const actionablePath = isActionablePath(path);
  const iconButtonClassName =
    "grid h-5 w-5 place-items-center rounded border border-setta-200 text-setta-500 opacity-0 transition-all duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100 hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200";
  return (
    <div className="group/header flex min-w-0 items-start justify-between gap-2 border-b border-setta-200/70 px-1 pb-1 dark:border-setta-700/70">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-setta-700 dark:text-setta-200">
          {title}
        </div>
        <div
          className="truncate font-mono text-[10px] text-setta-400 dark:text-setta-500"
          title={path}
        >
          {path}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1">
        <button
          aria-label={`Copy path for ${title}`}
          title="Copy path"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onCopyPath(path)}
        >
          <i className="gg-file !scale-[0.55]" />
        </button>
        <button
          aria-label={`Reveal path for ${title}`}
          title="Reveal in OS file explorer"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onRevealPath(path)}
        >
          <i className="gg-folder !scale-[0.55]" />
        </button>
      </div>
    </div>
  );
}

export function ProjectChatSkillsMcpViewer() {
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
  const codeMirrorTheme = useCodeMirrorStyle();
  const [skills, setSkills] = useState<AppGenSkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkillContent, setSelectedSkillContent] = useState("");
  const [skillContentLoading, setSkillContentLoading] = useState(false);
  const [mcpConfigPath, setMcpConfigPath] = useState<string | null>(null);
  const [settaFilesLocation, setSettaFilesLocation] = useState<string | null>(
    null,
  );

  const refreshSkillsBrowser = useCallback(async () => {
    setSkillsLoading(true);
    setSkillsError(null);
    const res = await route_get_app_gen_skills();
    setSkillsLoading(false);
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      setSkillsError(detail ?? "Failed to load skills.");
      setSkills([]);
      setSelectedSkillId(null);
      return;
    }
    const nextSkills = res.data;
    setSkills(nextSkills);
    if (nextSkills.length === 0) {
      setSelectedSkillId(null);
      return;
    }
    const hasSelectedSkill = nextSkills.some(
      (skill) => skill.skillId === selectedSkillId,
    );
    if (!hasSelectedSkill) {
      setSelectedSkillId(nextSkills[0].skillId);
    }
  }, [selectedSkillId]);

  useEffect(() => {
    void refreshSkillsBrowser();
  }, [refreshSkillsBrowser]);

  useEffect(() => {
    async function loadSkillContent() {
      if (!selectedSkillId) {
        setSelectedSkillContent("");
        return;
      }
      setSkillContentLoading(true);
      const res = await route_get_app_gen_skill_content({
        skillId: selectedSkillId,
      });
      setSkillContentLoading(false);
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setSelectedSkillContent(
          detail ?? "Failed to load selected skill content.",
        );
        return;
      }
      setSelectedSkillContent(res.data.content);
    }
    void loadSkillContent();
  }, [selectedSkillId]);

  useEffect(() => {
    async function loadMcpConfigPath() {
      const res = await route_get_setta_home_info();
      if (!res200(res)) {
        setMcpConfigPath(null);
        setSettaFilesLocation(null);
        return;
      }
      const path =
        typeof res.data.llmConfigPath === "string"
          ? res.data.llmConfigPath
          : null;
      setMcpConfigPath(path);
      const location =
        typeof res.data.activeSettaFilesLocation === "string"
          ? res.data.activeSettaFilesLocation
          : null;
      setSettaFilesLocation(location);
    }
    void loadMcpConfigPath();
  }, []);

  const filteredSkills = useMemo(() => {
    return filterSkills(skills, skillFilter);
  }, [skillFilter, skills]);
  const groupedSkills = useMemo(() => {
    return groupSkillsByRootPath(filteredSkills);
  }, [filteredSkills]);

  const mcpServerGroups = useMemo(() => {
    return groupMcpServersByConfigPath({
      mcpServers: allLLMConfigs?.mcpServers,
      mcpConfigPath,
      settaFilesLocation,
    });
  }, [allLLMConfigs?.mcpServers, mcpConfigPath, settaFilesLocation]);

  const markdownViewerExtensions = useMemo(() => {
    return getExtensions({
      language: "markdown",
      wrapLines: true,
      isDisabled: true,
      tabToAutocomplete: false,
      indentWithTab: false,
    });
  }, []);

  const copyPathToClipboard = useCallback((path: string) => {
    if (!isActionablePath(path)) {
      return;
    }
    void navigator.clipboard.writeText(path);
  }, []);

  const revealPathInFileExplorer = useCallback(async (path: string) => {
    if (!isActionablePath(path)) {
      return;
    }
    const res = await route_reveal_path_in_os_file_explorer({ path });
    if (!res200(res)) {
      return;
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm text-setta-600 dark:text-setta-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Skills / MCP Viewer
        </div>
        <button
          className="cursor-pointer rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={() => void refreshSkillsBrowser()}
        >
          Refresh
        </button>
      </div>
      <div className="grid gap-4">
        <section className="grid gap-2">
          <search className="relative flex min-w-0 items-center">
            <div className="absolute left-0 grid select-none place-items-center pl-1">
              <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
            </div>
            <input
              aria-label="Filter skills"
              className="min-w-0 flex-grow cursor-text truncate border-solid border-setta-200 bg-transparent py-1 pl-5 text-sm text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:!border-blue-300 dark:border-setta-800 dark:text-setta-200 dark:placeholder-setta-700"
              value={skillFilter}
              onChange={(event) => setSkillFilter(event.target.value)}
              placeholder="Filter"
            />
          </search>
          <div className="grid gap-2 @xl:grid-cols-2">
            <div className="max-h-[360px] min-h-[220px] overflow-y-auto rounded-md border border-setta-200 bg-white/80 p-2 text-xs dark:border-setta-700 dark:bg-setta-950/60">
              {skillsLoading ? (
                <div className="text-setta-500 dark:text-setta-400">
                  Loading skills...
                </div>
              ) : skillsError ? (
                <div className="text-setta-500 dark:text-setta-400">
                  Skills unavailable ({skillsError}). Restart the backend if
                  this route was just added.
                </div>
              ) : groupedSkills.length === 0 ? (
                <div className="text-setta-500 dark:text-setta-400">
                  No skills found.
                </div>
              ) : (
                groupedSkills.map((group, groupIndex) => (
                  <div
                    key={group.rootPath}
                    className={groupIndex === 0 ? "" : "mt-3"}
                  >
                    <PathGroupHeader
                      title={group.rootLabel}
                      path={group.rootPath}
                      onCopyPath={copyPathToClipboard}
                      onRevealPath={(path) =>
                        void revealPathInFileExplorer(path)
                      }
                    />
                    <div className="mt-1 grid gap-1 px-1">
                      {group.skills.slice(0, 200).map((skill) => {
                        const selected = skill.skillId === selectedSkillId;
                        return (
                          <button
                            key={skill.skillId}
                            className={`flex min-w-0 max-w-full cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded pl-1 pr-2 py-1 text-left transition-colors ${
                              selected
                                ? "-ml-px bg-blue-600 text-white"
                                : "hover:bg-setta-100 dark:hover:bg-setta-800"
                            }`}
                            onClick={() => setSelectedSkillId(skill.skillId)}
                          >
                            <span className="block w-full truncate font-semibold">
                              {skill.name}
                            </span>
                            <span className="block w-full truncate text-[11px] opacity-80">
                              {skill.relativePath}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="grid min-h-[220px] gap-1">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Skill Markdown Viewer
              </div>
              <div className="min-h-[220px] overflow-y-auto rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950">
                <CodeMirror
                  aria-label="Skill Markdown Viewer"
                  value={
                    skillContentLoading
                      ? "Loading skill content..."
                      : selectedSkillContent ||
                        "Select a skill to preview SKILL.md."
                  }
                  theme={codeMirrorTheme}
                  extensions={markdownViewerExtensions}
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    highlightActiveLine: false,
                    tabSize: 4,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
        <section className="grid gap-2">
          <div className="text-xs text-setta-500 dark:text-setta-400">
            MCP Servers
          </div>
          <div className="max-h-[220px] min-h-[110px] overflow-y-auto rounded-md border border-setta-200 bg-white/80 p-2 text-[11px] dark:border-setta-700 dark:bg-setta-950/60">
            {mcpServerGroups.length === 0 ? (
              <div className="text-setta-500 dark:text-setta-400">
                No MCP servers configured.
              </div>
            ) : (
              mcpServerGroups.map((group, groupIndex) => (
                <div
                  key={group.configPath}
                  className={groupIndex === 0 ? "" : "mt-3"}
                >
                  <PathGroupHeader
                    title={group.configLabel}
                    path={group.configPath}
                    onCopyPath={copyPathToClipboard}
                    onRevealPath={(path) => void revealPathInFileExplorer(path)}
                  />
                  <div className="mt-1 grid gap-1 px-1">
                    {group.servers.map((server) => (
                      <div key={server.serverId} className="pb-1 last:pb-0">
                        <div className="font-semibold">{server.serverId}</div>
                        <div className="font-mono text-setta-500 dark:text-setta-400">
                          {server.transport} · {server.endpoint}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
