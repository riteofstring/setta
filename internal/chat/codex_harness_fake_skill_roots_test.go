package chat

import "path/filepath"

func assertFakeCodexSkillRootsSetParams(message map[string]any) {
	if message["method"] != "skills/extraRoots/set" {
		panic("skill root setup should use skills/extraRoots/set")
	}
	params := fakeParams(message)
	roots, ok := params["extraRoots"].([]any)
	if !ok || len(roots) == 0 {
		panic("skills/extraRoots/set missing extraRoots")
	}
	workflowBuilderRootFound := false
	for _, rawRoot := range roots {
		root, ok := rawRoot.(string)
		if !ok || root == "" {
			panic("skills/extraRoots/set extraRoots must be non-empty strings")
		}
		if !filepath.IsAbs(root) {
			panic("skills/extraRoots/set extraRoot must be absolute")
		}
		if filepath.Base(root) == "skills" && filepath.Base(filepath.Dir(root)) == ".codex" {
			workflowBuilderRootFound = true
		}
	}
	if !workflowBuilderRootFound {
		panic("skills/extraRoots/set missing Setta .codex/skills root")
	}
}

func assertFakeCodexSkillRootsConfigured(mode string, state *fakeCodexState) {
	if mode == "structured-task" {
		return
	}
	if !state.skillRootsConfigured {
		panic("thread start/resume missing prior Codex skill root setup")
	}
}
