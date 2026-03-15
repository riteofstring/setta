package codegen

import (
	"errors"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

var (
	ErrPythonMetadataRendererExportRequired = errors.New("codegen: python metadata renderer export is required")
	ErrPythonMetadataRendererGraphRequired  = errors.New("codegen: python metadata renderer graph is required")
)

type PythonMetadataRenderer struct {
	export        projectstate.PythonCodegenExport
	graph         *PythonDependencyGraph
	GeneratedCode string
}

type pythonSectionMetadataEntry struct {
	ID              string
	Name            string
	Type            string
	FullPathName    string
	IsTopLevel      bool
	ParentSectionID string
	VariantID       string
	VariantName     string
}

func NewPythonMetadataRenderer(
	export projectstate.PythonCodegenExport,
	graph *PythonDependencyGraph,
) *PythonMetadataRenderer {
	return &PythonMetadataRenderer{
		export: export,
		graph:  graph,
	}
}

func (r *PythonMetadataRenderer) GenerateCode() (string, error) {
	if strings.TrimSpace(r.export.ProjectID) == "" {
		return "", ErrPythonMetadataRendererExportRequired
	}
	if r.graph == nil {
		return "", ErrPythonMetadataRendererGraphRequired
	}

	entries, err := r.collectSectionEntries()
	if err != nil {
		return "", err
	}

	lines := []string{
		"from dataclasses import dataclass",
		"",
		"@dataclass(frozen=True)",
		"class ProjectMetadata:",
		"    id: str",
		"    name: str",
		"    activeViewModeId: str | None",
		"    entryCodeBlockId: str | None",
		"    activeIds: list[str]",
		"    showParamDisplayNames: bool",
		"    previewImgColor: str",
		"",
		"@dataclass(frozen=True)",
		"class SectionMetadata:",
		"    id: str",
		"    name: str",
		"    type: str",
		"    fullPathName: str",
		"    isTopLevel: bool",
		"    parentSectionId: str | None",
		"    variantId: str | None",
		"    variantName: str | None",
		"",
		"@dataclass(frozen=True)",
		"class SettaGenMetadata:",
		"    project: ProjectMetadata",
		"    sections: dict[str, SectionMetadata]",
		"    sections_by_id: dict[str, SectionMetadata]",
		"",
		"project = ProjectMetadata(",
		"    id=" + renderPythonStringLiteral(r.export.ProjectID) + ",",
		"    name=" + renderPythonStringLiteral(r.export.ProjectName) + ",",
		"    activeViewModeId=" + formatOptionalPythonString(r.export.ActiveViewModeID) + ",",
		"    entryCodeBlockId=" + formatOptionalPythonString(r.export.EntryCodeBlockID) + ",",
		"    activeIds=" + formatPythonStringList(r.export.ActiveIDs) + ",",
		"    showParamDisplayNames=" + formatPythonBool(r.export.ShowParamDisplayNames) + ",",
		"    previewImgColor=" + renderPythonStringLiteral(r.export.PreviewImgColor) + ",",
		")",
		"",
	}
	lines = append(lines, renderPythonSectionMetadataMap("sections", entries, func(entry pythonSectionMetadataEntry) string {
		return entry.FullPathName
	})...)
	lines = append(lines, "")
	lines = append(lines, renderPythonSectionMetadataMap("sections_by_id", entries, func(entry pythonSectionMetadataEntry) string {
		return entry.ID
	})...)
	lines = append(lines,
		"",
		"meta = SettaGenMetadata(project=project, sections=sections, sections_by_id=sections_by_id)",
	)

	r.GeneratedCode = joinLines(lines)
	return r.GeneratedCode, nil
}

func (r *PythonMetadataRenderer) collectSectionEntries() ([]pythonSectionMetadataEntry, error) {
	keys := r.graph.NodeOrder
	if len(keys) == 0 {
		keys = make([]PythonDependencyKey, 0, len(r.graph.Nodes))
		for key := range r.graph.Nodes {
			keys = append(keys, key)
		}
		keys = orderedDependencyKeys(mapKeysToTrue(keys), nil)
	}

	entries := make([]pythonSectionMetadataEntry, 0, len(keys))
	seen := map[string]struct{}{}
	for _, key := range keys {
		node, ok := r.graph.Node(key)
		if !ok {
			continue
		}
		sectionNode, ok := node.(*PythonSectionNode)
		if !ok {
			continue
		}
		if _, exists := seen[sectionNode.ID]; exists {
			continue
		}
		section, err := r.export.ResolveSection(sectionNode.ID)
		if err != nil {
			return nil, err
		}
		entries = append(entries, pythonSectionMetadataEntry{
			ID:              section.ID,
			Name:            section.Name,
			Type:            sectionNode.SectionType,
			FullPathName:    sectionNode.FullPathName,
			IsTopLevel:      sectionNode.IsTopLevel,
			ParentSectionID: section.ParentSectionID,
			VariantID:       section.VariantID,
			VariantName:     section.VariantName,
		})
		seen[sectionNode.ID] = struct{}{}
	}
	return entries, nil
}

func renderPythonSectionMetadataMap(
	variableName string,
	entries []pythonSectionMetadataEntry,
	keyFn func(pythonSectionMetadataEntry) string,
) []string {
	sortedEntries := append([]pythonSectionMetadataEntry(nil), entries...)
	sort.Slice(sortedEntries, func(i int, j int) bool {
		return keyFn(sortedEntries[i]) < keyFn(sortedEntries[j])
	})

	lines := []string{variableName + " = {"}
	for _, entry := range sortedEntries {
		lines = append(lines, "    "+renderPythonStringLiteral(keyFn(entry))+": SectionMetadata(")
		lines = append(lines, renderPythonSectionMetadata(entry, "        ")...)
		lines = append(lines, "    ),")
	}
	lines = append(lines, "}")
	return lines
}

func renderPythonSectionMetadata(entry pythonSectionMetadataEntry, indent string) []string {
	variantName := "None"
	if strings.TrimSpace(entry.VariantID) != "" {
		variantName = renderPythonStringLiteral(entry.VariantName)
	}
	return []string{
		indent + "id=" + renderPythonStringLiteral(entry.ID) + ",",
		indent + "name=" + renderPythonStringLiteral(entry.Name) + ",",
		indent + "type=" + renderPythonStringLiteral(entry.Type) + ",",
		indent + "fullPathName=" + renderPythonStringLiteral(entry.FullPathName) + ",",
		indent + "isTopLevel=" + formatPythonBool(entry.IsTopLevel) + ",",
		indent + "parentSectionId=" + formatOptionalPythonString(entry.ParentSectionID) + ",",
		indent + "variantId=" + formatOptionalPythonString(entry.VariantID) + ",",
		indent + "variantName=" + variantName + ",",
	}
}

func formatOptionalPythonString(value string) string {
	if strings.TrimSpace(value) == "" {
		return "None"
	}
	return renderPythonStringLiteral(value)
}

func formatPythonStringList(values []string) string {
	if len(values) == 0 {
		return "[]"
	}
	items := make([]string, 0, len(values))
	for _, value := range values {
		items = append(items, renderPythonStringLiteral(value))
	}
	return "[" + strings.Join(items, ", ") + "]"
}

func formatPythonBool(value bool) string {
	if value {
		return "True"
	}
	return "False"
}
