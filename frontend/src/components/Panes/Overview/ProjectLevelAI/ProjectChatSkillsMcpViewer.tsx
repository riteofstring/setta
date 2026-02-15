import { useCallback, useEffect, useMemo, useState } from "react";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
  route_get_setta_home_info,
} from "utils/generatedEndpoints";
import { type AppGenSkillEntry } from "utils/generatedTypes";
import {
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
} from "./projectChatSkillsMcpViewerUtils";

export function ProjectChatSkillsMcpViewer() {
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm text-setta-600 dark:text-setta-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Skills / MCP Viewer
        </div>
        <button
          className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
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
                groupedSkills.map((group) => (
                  <div
                    key={group.rootPath}
                    className="mb-2 border-b border-setta-100 pb-2 last:mb-0 last:border-b-0 last:pb-0 dark:border-setta-800"
                  >
                    <div className="px-1 font-mono text-[11px] text-setta-500 dark:text-setta-400">
                      {group.rootPath}
                    </div>
                    <div className="px-1 text-[11px] text-setta-500 dark:text-setta-400">
                      {group.rootLabel}
                    </div>
                    <div className="mt-1 grid gap-1">
                      {group.skills.slice(0, 200).map((skill) => {
                        const selected = skill.skillId === selectedSkillId;
                        return (
                          <button
                            key={skill.skillId}
                            className={`flex w-full flex-col items-start gap-0.5 rounded px-2 py-1 text-left transition-colors ${
                              selected
                                ? "bg-blue-600 text-white"
                                : "hover:bg-setta-100 dark:hover:bg-setta-800"
                            }`}
                            onClick={() => setSelectedSkillId(skill.skillId)}
                          >
                            <span className="font-semibold">{skill.name}</span>
                            <span className="text-[11px] opacity-80">
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
            <textarea
              aria-label="Skill Preview"
              className="min-h-[220px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-[11px] text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
              readOnly
              value={
                skillContentLoading
                  ? "Loading skill content..."
                  : selectedSkillContent ||
                    "Select a skill to preview SKILL.md."
              }
            />
          </div>
        </section>
        <section className="grid gap-2">
          <div className="text-xs text-setta-500 dark:text-setta-400">
            MCP Servers
          </div>
          <div className="max-h-[220px] min-h-[110px] overflow-y-auto rounded-md border border-setta-200 bg-white/80 p-2 font-mono text-[11px] dark:border-setta-700 dark:bg-setta-950/60">
            {mcpServerGroups.length === 0 ? (
              <div className="text-setta-500 dark:text-setta-400">
                No MCP servers configured.
              </div>
            ) : (
              mcpServerGroups.map((group) => (
                <div
                  key={group.configPath}
                  className="mb-2 border-b border-setta-100 pb-2 last:mb-0 last:border-b-0 last:pb-0 dark:border-setta-800"
                >
                  <div className="break-all px-1 font-mono text-[11px] text-setta-500 dark:text-setta-400">
                    {group.configPath}
                  </div>
                  <div className="px-1 text-[11px] text-setta-500 dark:text-setta-400">
                    {group.configLabel}
                  </div>
                  <div className="mt-1 grid gap-1 px-1">
                    {group.servers.map((server) => (
                      <div key={server.serverId} className="pb-1 last:pb-0">
                        <div className="font-semibold">{server.serverId}</div>
                        <div className="text-setta-500 dark:text-setta-400">
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
