package listenersnapshot

import (
	"encoding/json"
	"sort"
	"strings"

	"setta/internal/codegen"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

type ListenerSnapshotPayload struct {
	ProjectState      json.RawMessage
	DependencyCatalog *realtime.ListenerDependencyCatalog
}

func BuildListenerSnapshotPayload(document projectstate.Document, projectID string) (ListenerSnapshotPayload, error) {
	projectStateView, err := projectview.SingleConfigByProjectID(document, projectID)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}
	projectStatePayload, err := json.Marshal(projectStateView)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}
	dependencyCatalog, err := BuildListenerDependencyCatalog(project)
	if err != nil {
		return ListenerSnapshotPayload{}, err
	}

	return ListenerSnapshotPayload{
		ProjectState:      projectStatePayload,
		DependencyCatalog: dependencyCatalog,
	}, nil
}

func BuildListenerDependencyCatalog(project projectstate.Project) (*realtime.ListenerDependencyCatalog, error) {
	exported, err := project.ListenerDependencyExport()
	if err != nil {
		return nil, err
	}
	graph, err := codegen.BuildPythonDependencyGraph(exported, codegen.PythonDependencyGraphOptions{})
	if err != nil {
		return nil, err
	}

	keys := append([]codegen.PythonDependencyKey(nil), graph.NodeOrder...)
	if len(keys) == 0 {
		keys = make([]codegen.PythonDependencyKey, 0, len(graph.Nodes))
		for key := range graph.Nodes {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i int, j int) bool {
			return canonicalListenerDependencyKey(keys[i]) < canonicalListenerDependencyKey(keys[j])
		})
	}

	entries := make([]realtime.ListenerDependencyCatalogEntry, 0, len(keys))
	for _, key := range keys {
		node, ok := graph.Node(key)
		if !ok {
			continue
		}
		entry := realtime.ListenerDependencyCatalogEntry{
			DependencyKey: canonicalListenerDependencyKey(key),
			FullPathName:  strings.TrimSpace(node.Base().FullPathName),
		}
		switch typed := node.(type) {
		case *codegen.PythonSectionNode:
			entry.SectionType = strings.TrimSpace(typed.SectionType)
			entry.ControlCodeObjID = strings.TrimSpace(typed.ControlCodeObjID)
		case *codegen.PythonParamNode:
			entry.CodeObjType = strings.TrimSpace(typed.CodeObjectType)
		}
		entries = append(entries, entry)
	}

	return &realtime.ListenerDependencyCatalog{Entries: entries}, nil
}

func canonicalListenerDependencyKey(key codegen.PythonDependencyKey) string {
	sectionID := strings.TrimSpace(key.SectionID)
	codeObjectID := strings.TrimSpace(key.CodeObjectID)
	if codeObjectID == "" {
		return sectionID
	}
	return sectionID + "." + codeObjectID
}
