import { useCallback, useEffect, useMemo, useState } from "react";
import { useAIStore } from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_call_mcp_tool,
  route_get_app_gen_skill_content,
  route_get_app_gen_skills,
} from "utils/generatedEndpoints";
import { type AppGenSkillEntry } from "utils/generatedTypes";
import {
  filterSkills,
  formatMcpToolsError,
  parseMcpToolsFromResult,
} from "./projectChatSkillsMcpViewerUtils";

export function ProjectChatSkillsMcpViewer() {
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
  const [mcpToolNames, setMcpToolNames] = useState<string[]>([]);
  const [mcpBrowserError, setMcpBrowserError] = useState<string | null>(null);
  const [mcpToolFilter, setMcpToolFilter] = useState("");
  const [skills, setSkills] = useState<AppGenSkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkillContent, setSelectedSkillContent] = useState("");
  const [skillContentLoading, setSkillContentLoading] = useState(false);

  const refreshMcpToolBrowser = useCallback(async () => {
    const res = await route_call_mcp_tool({
      tool: "list_mcp_tools",
      arguments: {},
    });
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      setMcpBrowserError(formatMcpToolsError(detail));
      setMcpToolNames([]);
      return;
    }
    const parsed = parseMcpToolsFromResult(res.data);
    setMcpToolNames(parsed.toolNames);
    setMcpBrowserError(parsed.mcpError);
  }, []);

  const refreshSkillsBrowser = useCallback(async () => {
    setSkillsLoading(true);
    setSkillsError(null);
    const res = await route_get_app_gen_skills();
    setSkillsLoading(false);
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      setSkillsError(detail ?? "Failed to load skills.");
      setSkills([]);
      return;
    }
    setSkills(res.data);
    if (res.data.length > 0 && !selectedSkillId) {
      setSelectedSkillId(res.data[0].skillId);
    }
  }, [selectedSkillId]);

  useEffect(() => {
    void refreshMcpToolBrowser();
  }, [refreshMcpToolBrowser]);

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

  const filteredMcpToolNames = useMemo(() => {
    const normalizedQuery = mcpToolFilter.trim().toLowerCase();
    if (!normalizedQuery) {
      return mcpToolNames;
    }
    return mcpToolNames.filter((name) =>
      name.toLowerCase().includes(normalizedQuery),
    );
  }, [mcpToolFilter, mcpToolNames]);

  const filteredSkills = useMemo(() => {
    return filterSkills(skills, skillFilter);
  }, [skillFilter, skills]);

  const mcpServers = useMemo(() => {
    const raw = allLLMConfigs?.mcpServers;
    if (!raw) {
      return [];
    }
    return Object.entries(raw)
      .map(([serverId, config]) => {
        const record =
          config && typeof config === "object"
            ? (config as Record<string, unknown>)
            : null;
        const transport =
          record && typeof record.transport === "string"
            ? record.transport
            : "unknown";
        const endpoint =
          record && typeof record.url === "string"
            ? record.url
            : record && typeof record.command === "string"
              ? record.command
              : "(no endpoint)";
        return { serverId, transport, endpoint };
      })
      .sort((a, b) => a.serverId.localeCompare(b.serverId));
  }, [allLLMConfigs?.mcpServers]);

  const mcpServerCount = mcpServers.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm text-setta-600 dark:text-setta-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Skills / MCP Viewer
        </div>
        <button
          className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={() => {
            void refreshSkillsBrowser();
            void refreshMcpToolBrowser();
          }}
        >
          Refresh
        </button>
      </div>
      <div className="rounded-md border border-setta-200 bg-setta-50/80 px-3 py-2 text-[11px] text-setta-500 dark:border-setta-700 dark:bg-setta-900/40 dark:text-setta-400">
        Viewer only: selecting a skill here previews its content. It does not
        enable or disable skills or MCP servers.
      </div>
      <div className="grid gap-3 @xl:grid-cols-2">
        <div className="grid gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Filter skills
            <input
              aria-label="Filter skills"
              className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
              value={skillFilter}
              onChange={(event) => setSkillFilter(event.target.value)}
              placeholder="Search skills"
            />
          </label>
          <div className="max-h-52 overflow-y-auto rounded-md border border-setta-200 bg-white/80 p-2 text-xs dark:border-setta-700 dark:bg-setta-950/60">
            {skillsLoading ? (
              <div className="text-setta-500 dark:text-setta-400">
                Loading skills...
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="text-setta-500 dark:text-setta-400">
                No skills found.
              </div>
            ) : (
              filteredSkills.slice(0, 200).map((skill) => {
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
                      {skill.rootLabel} · {skill.relativePath}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {skillsError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
              {skillsError}
            </div>
          )}
          <label className="flex flex-col gap-1 text-xs">
            Filter MCP tools
            <input
              aria-label="Filter MCP tools"
              className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
              value={mcpToolFilter}
              onChange={(event) => setMcpToolFilter(event.target.value)}
              placeholder="Search MCP tool names"
            />
          </label>
          <div className="max-h-40 overflow-y-auto rounded-md border border-setta-200 bg-white/80 p-2 font-mono text-[11px] dark:border-setta-700 dark:bg-setta-950/60">
            {filteredMcpToolNames.length === 0 ? (
              <div className="text-setta-500 dark:text-setta-400">
                No MCP tools match the current filter.
              </div>
            ) : (
              filteredMcpToolNames
                .slice(0, 120)
                .map((name) => <div key={name}>{name}</div>)
            )}
          </div>
          {mcpBrowserError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
              {mcpBrowserError}
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <div className="text-xs text-setta-500 dark:text-setta-400">
            MCP Servers
          </div>
          <div className="max-h-36 overflow-y-auto rounded-md border border-setta-200 bg-white/80 p-2 font-mono text-[11px] dark:border-setta-700 dark:bg-setta-950/60">
            {mcpServers.length === 0 ? (
              <div className="text-setta-500 dark:text-setta-400">
                No MCP servers configured.
              </div>
            ) : (
              mcpServers.map((server) => (
                <div key={server.serverId} className="pb-1">
                  <div className="font-semibold">{server.serverId}</div>
                  <div className="text-setta-500 dark:text-setta-400">
                    {server.transport} · {server.endpoint}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-setta-500 dark:text-setta-400">
            Skill Preview
          </div>
          <textarea
            aria-label="Skill Preview"
            className="min-h-[280px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-[11px] text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            readOnly
            value={
              skillContentLoading
                ? "Loading skill content..."
                : selectedSkillContent || "Select a skill to preview SKILL.md."
            }
          />
          <div className="text-[11px] text-setta-500 dark:text-setta-400">
            MCP servers configured: {mcpServerCount}
          </div>
          <div className="text-[11px] text-setta-500 dark:text-setta-400">
            MCP tools discovered: {mcpToolNames.length}
          </div>
        </div>
      </div>
    </div>
  );
}
