package agenticsummarycache

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/projectstate"
)

func TestServiceBuildStatusForChatReturnsEmptyWhenNoSummaryEdges(t *testing.T) {
	t.Parallel()

	service := newSummaryCacheTestService(t)
	project := newSummaryCacheTestProject()

	status, err := service.BuildStatusForChat(project, "chat-section")
	if err != nil {
		t.Fatalf("build status: %v", err)
	}

	if status.MaxSummariesPerRun != MaxSummariesPerRun {
		t.Fatalf("expected max %d, got %d", MaxSummariesPerRun, status.MaxSummariesPerRun)
	}
	if len(status.SummarySectionIDs) != 0 || len(status.CachedSectionIDs) != 0 || len(status.MissingSectionIDs) != 0 {
		t.Fatalf("expected empty status lists, got %#v", status)
	}
}

func TestServiceBuildStatusForChatRespectsGenerationCap(t *testing.T) {
	t.Parallel()

	service := newSummaryCacheTestService(t)
	project := newSummaryCacheTestProject()
	for index := 0; index < 8; index++ {
		sectionID := summaryCacheTextSectionID(index)
		project = addSummaryCacheTextSection(project, sectionID, "hello")
		project.AgenticEdges = append(project.AgenticEdges, summaryCacheTestEdge("chat-section", sectionID))
	}

	status, err := service.BuildStatusForChat(project, "chat-section")
	if err != nil {
		t.Fatalf("build status: %v", err)
	}

	if len(status.SummarySectionIDs) != 8 {
		t.Fatalf("expected eight summary sections, got %#v", status.SummarySectionIDs)
	}
	if len(status.MissingSectionIDs) != 8 {
		t.Fatalf("expected eight missing sections, got %#v", status.MissingSectionIDs)
	}
	if len(status.ConsideredSectionIDs) != MaxSummariesPerRun {
		t.Fatalf("expected %d considered sections, got %#v", MaxSummariesPerRun, status.ConsideredSectionIDs)
	}
	if !reflect.DeepEqual(status.ConsideredSectionIDs, status.MissingSectionIDs[:MaxSummariesPerRun]) {
		t.Fatalf("expected considered ids to match capped missing ids, got %#v and %#v", status.ConsideredSectionIDs, status.MissingSectionIDs)
	}
	if !reflect.DeepEqual(status.WouldAttemptSectionIDs, status.ConsideredSectionIDs) {
		t.Fatalf("expected would-attempt ids to match considered ids, got %#v", status.WouldAttemptSectionIDs)
	}
}

func TestServiceBuildStatusForChatReportsCachedAndEmptySources(t *testing.T) {
	t.Parallel()

	service := newSummaryCacheTestService(t)
	project := newSummaryCacheTestProject()
	project = addSummaryCacheTextSection(project, "cached-section", "hello cached")
	project = addSummaryCacheTextSection(project, "empty-section", "")
	project.AgenticEdges = append(project.AgenticEdges,
		summaryCacheTestEdge("chat-section", "cached-section"),
		summaryCacheTestEdge("chat-section", "empty-section"),
	)

	cachedSource, err := buildSectionSummarySource(project, "cached-section")
	if err != nil {
		t.Fatalf("build cached source: %v", err)
	}
	writeSummaryCacheTestEntries(t, service.Path(), map[string]any{
		buildCacheKey(project.ID, "cached-section", cachedSource.VariantID, cachedSource.ContentHash): map[string]any{
			"summary":     "- cached",
			"createdAtMs": 0,
		},
	})

	status, err := service.BuildStatusForChat(project, "chat-section")
	if err != nil {
		t.Fatalf("build status: %v", err)
	}

	if !reflect.DeepEqual(status.CachedSectionIDs, []string{"cached-section"}) {
		t.Fatalf("expected cached section, got %#v", status.CachedSectionIDs)
	}
	if !reflect.DeepEqual(status.EmptySourceSectionIDs, []string{"empty-section"}) {
		t.Fatalf("expected empty-source section, got %#v", status.EmptySourceSectionIDs)
	}
	if !reflect.DeepEqual(status.MissingSectionIDs, []string{"empty-section"}) {
		t.Fatalf("expected empty section to remain missing, got %#v", status.MissingSectionIDs)
	}
	if len(status.WouldAttemptSectionIDs) != 0 {
		t.Fatalf("expected no attempted sections for empty source, got %#v", status.WouldAttemptSectionIDs)
	}
}

func TestServiceBuildStatusForChatDedupesDuplicateSummaryEdges(t *testing.T) {
	t.Parallel()

	service := newSummaryCacheTestService(t)
	project := newSummaryCacheTestProject()
	project = addSummaryCacheTextSection(project, "source-section", "hello")
	project.AgenticEdges = append(project.AgenticEdges,
		summaryCacheTestEdge("chat-section", "source-section"),
		summaryCacheTestEdge("chat-section", "source-section"),
	)

	status, err := service.BuildStatusForChat(project, "chat-section")
	if err != nil {
		t.Fatalf("build status: %v", err)
	}

	if !reflect.DeepEqual(status.SummarySectionIDs, []string{"source-section"}) {
		t.Fatalf("expected deduped summary section ids, got %#v", status.SummarySectionIDs)
	}
	if !reflect.DeepEqual(status.MissingSectionIDs, []string{"source-section"}) {
		t.Fatalf("expected deduped missing section ids, got %#v", status.MissingSectionIDs)
	}
}

func TestBuildSectionSummarySourceUsesTopLevelParamValuesForDictSections(t *testing.T) {
	t.Parallel()

	project := newSummaryCacheTestProject()
	project = addSummaryCacheDictSection(project, "dict-section", "size", "large")

	source, err := buildSectionSummarySource(project, "dict-section")
	if err != nil {
		t.Fatalf("build source: %v", err)
	}

	if source.RawText != "- size: large" {
		t.Fatalf("expected dict param summary raw text, got %q", source.RawText)
	}
	if source.ContentHash == "" {
		t.Fatal("expected content hash")
	}
}

func TestExtractSectionSummaryTextUsesChartMetadata(t *testing.T) {
	t.Parallel()

	project := newSummaryCacheTestProject()
	summary, err := extractSectionSummaryText(project, map[string]any{
		"dataPath": "sales.csv",
		"chartSettings": map[string]any{
			"type":        "bar",
			"xAxisColumn": "month",
		},
	}, chartSectionType)
	if err != nil {
		t.Fatalf("extract summary: %v", err)
	}

	expected := strings.Join([]string{
		"dataPath: sales.csv",
		"chartType: bar",
		"xAxisColumn: month",
	}, "\n")
	if summary != expected {
		t.Fatalf("expected chart summary %q, got %q", expected, summary)
	}
}

func TestExtractSectionSummaryTextUsesRenderedPromptBeforeTemplate(t *testing.T) {
	t.Parallel()

	project := newSummaryCacheTestProject()
	summary, err := extractSectionSummaryText(project, map[string]any{
		"renderedText": "rendered prompt",
		"template":     "template prompt",
	}, promptSectionType)
	if err != nil {
		t.Fatalf("extract summary: %v", err)
	}
	if summary != "rendered prompt" {
		t.Fatalf("expected rendered prompt summary, got %q", summary)
	}
}

func TestBuildDrawSummaryTextDedupesAndLimitsOutput(t *testing.T) {
	t.Parallel()

	layers := make([]any, 0, drawLayerNameLimit+2)
	for index := 0; index < drawLayerNameLimit+2; index++ {
		layers = append(layers, map[string]any{
			"name": "layer-" + string(rune('a'+index)),
			"elements": []any{
				map[string]any{"dataPath": "asset-a.png"},
				map[string]any{"dataPath": "asset-b.png"},
				map[string]any{"dataPath": "asset-a.png"},
			},
		})
	}

	summary := buildDrawSummaryText(map[string]any{
		"renderedImagePath": "preview.png",
		"layers":            layers,
	})
	expected := strings.Join([]string{
		"layerCount: 10",
		"renderedImagePath: preview.png",
		"layers:",
		"- layer-a",
		"- layer-b",
		"- layer-c",
		"- layer-d",
		"- layer-e",
		"- layer-f",
		"- layer-g",
		"- layer-h",
		"... (2 more)",
		"assetPaths:",
		"- asset-a.png",
		"- asset-b.png",
	}, "\n")
	if summary != expected {
		t.Fatalf("expected draw summary %q, got %q", expected, summary)
	}
}

func newSummaryCacheTestService(t *testing.T) *Service {
	t.Helper()

	service, err := NewService(t.TempDir())
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func writeSummaryCacheTestEntries(t *testing.T, path string, entries map[string]any) {
	t.Helper()

	payload := map[string]any{
		"version": currentCacheVersion,
		"entries": entries,
	}
	content, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal cache payload: %v", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write cache payload: %v", err)
	}
}

func summaryCacheTextSectionID(index int) string {
	return filepath.Base(filepath.Join("section", "source-"+string(rune('a'+index))))
}

func newSummaryCacheTestProject() projectstate.Project {
	project := projectstate.Project{
		ID:                "project-alpha",
		Name:              "Alpha",
		SectionVariantMap: map[string]string{},
		Sections:          map[string]projectstate.Section{},
		SectionVariants:   map[string]projectstate.SectionVariant{},
		SectionImpls:      map[string]projectstate.SectionImpl{},
		CodeObjs:          map[string]projectstate.CodeObject{},
		CodeObjVariants:   map[string]projectstate.CodeObjectVariant{},
		CodeObjImpls:      map[string]projectstate.CodeObjectImpl{},
		AgenticEdges:      []projectstate.AgenticEdge{},
	}
	project = addSummaryCacheSection(project, "chat-section", "Chat", map[string]any{
		"id":   "chat-impl",
		"type": "Chat",
	})
	return project
}

func addSummaryCacheTextSection(project projectstate.Project, sectionID string, text string) projectstate.Project {
	return addSummaryCacheSection(project, sectionID, "TextBlock", map[string]any{
		"id":   sectionID + "-impl",
		"type": "TextBlock",
		"text": text,
	})
}

func addSummaryCacheDictSection(project projectstate.Project, sectionID string, paramName string, paramValue string) projectstate.Project {
	sectionImplID := sectionID + "-impl"
	rootCodeObjID := sectionID + "-root"
	rootVariantID := rootCodeObjID + "-variant"
	rootImplID := rootCodeObjID + "-impl"
	childCodeObjID := sectionID + "-child"
	childVariantID := childCodeObjID + "-variant"
	childImplID := childCodeObjID + "-impl"

	project = addSummaryCacheSection(project, sectionID, "Dict", map[string]any{
		"id":              sectionImplID,
		"type":            "Dict",
		"topLevelParamId": rootCodeObjID,
		"codeObjVariantMap": map[string]any{
			rootCodeObjID:  rootVariantID,
			childCodeObjID: childVariantID,
		},
	})

	project.CodeObjs[rootCodeObjID] = projectstate.CodeObject{
		ID:               rootCodeObjID,
		Name:             "root",
		VariantIDs:       []string{rootVariantID},
		DefaultVariantID: rootVariantID,
	}
	project.CodeObjVariants[rootVariantID] = projectstate.CodeObjectVariant{
		ID:     rootVariantID,
		ImplID: rootImplID,
	}
	project.CodeObjImpls[rootImplID] = projectstate.CodeObjectImpl{
		ID:      rootImplID,
		Type:    "NestedParam",
		Payload: mustMarshalSummaryCacheJSON(map[string]any{"id": rootImplID, "type": "NestedParam", "children": []string{childCodeObjID}}),
	}
	project.CodeObjs[childCodeObjID] = projectstate.CodeObject{
		ID:               childCodeObjID,
		Name:             paramName,
		VariantIDs:       []string{childVariantID},
		DefaultVariantID: childVariantID,
	}
	project.CodeObjVariants[childVariantID] = projectstate.CodeObjectVariant{
		ID:     childVariantID,
		ImplID: childImplID,
	}
	project.CodeObjImpls[childImplID] = projectstate.CodeObjectImpl{
		ID:      childImplID,
		Type:    "TextParam",
		Payload: mustMarshalSummaryCacheJSON(map[string]any{"id": childImplID, "type": "TextParam", "value": paramValue}),
	}
	return project
}

func addSummaryCacheSection(project projectstate.Project, sectionID string, sectionType string, payload map[string]any) projectstate.Project {
	variantID := sectionID + "-variant"
	implID := sectionID + "-impl"
	if id, ok := payload["id"].(string); ok && id != "" {
		implID = id
	}
	project.Sections[sectionID] = projectstate.Section{
		ID:               sectionID,
		Name:             sectionID,
		VariantIDs:       []string{variantID},
		DefaultVariantID: variantID,
	}
	project.SectionVariants[variantID] = projectstate.SectionVariant{
		ID:     variantID,
		ImplID: implID,
	}
	project.SectionImpls[implID] = projectstate.SectionImpl{
		ID:      implID,
		Kind:    projectstate.SectionKind(sectionType),
		Payload: mustMarshalSummaryCacheJSON(payload),
	}
	project.SectionVariantMap[sectionID] = variantID
	return project
}

func summaryCacheTestEdge(chatSectionID string, targetSectionID string) projectstate.AgenticEdge {
	return projectstate.AgenticEdge{
		ID:              chatSectionID + "-to-" + targetSectionID,
		SourceSectionID: chatSectionID,
		TargetSectionID: targetSectionID,
		Kind:            "chat_section",
		ContextMode:     "summary",
	}
}

func mustMarshalSummaryCacheJSON(value map[string]any) projectstate.RawJSON {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}
