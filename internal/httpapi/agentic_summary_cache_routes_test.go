package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterAgenticSummaryCacheRoutesReturnsStatus(t *testing.T) {
	t.Parallel()

	projectRuntime := newAgenticSummaryCacheRouteRuntime(t, agenticSummaryCacheRouteTestDocument())
	service := newAgenticSummaryCacheRouteService(t)
	writeAgenticSummaryCacheRouteTestEntries(t, service.Path(), map[string]any{})
	handler := newAgenticSummaryCacheRouteHandler(t, config.ModeIDE, projectRuntime, service)

	requestBody := []byte(`{"projectConfigId":"project-alpha","chatSectionId":"chat-section"}`)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgenticSummaryCacheStatus, bytes.NewReader(requestBody))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var status agenticsummarycache.Status
	if err := json.Unmarshal(response.Body.Bytes(), &status); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if status.MaxSummariesPerRun != agenticsummarycache.MaxSummariesPerRun {
		t.Fatalf("expected max summaries %d, got %d", agenticsummarycache.MaxSummariesPerRun, status.MaxSummariesPerRun)
	}
	if len(status.SummarySectionIDs) != 1 || status.SummarySectionIDs[0] != "source-section" {
		t.Fatalf("expected source-section summary id, got %#v", status.SummarySectionIDs)
	}
	if len(status.MissingSectionIDs) != 1 || status.MissingSectionIDs[0] != "source-section" {
		t.Fatalf("expected source-section missing id, got %#v", status.MissingSectionIDs)
	}
}

func TestRegisterAgenticSummaryCacheRoutesReturnsProjectNotFound(t *testing.T) {
	t.Parallel()

	projectRuntime := newAgenticSummaryCacheRouteRuntime(t, agenticSummaryCacheRouteTestDocument())
	service := newAgenticSummaryCacheRouteService(t)
	handler := newAgenticSummaryCacheRouteHandler(t, config.ModeIDE, projectRuntime, service)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgenticSummaryCacheStatus, bytes.NewReader([]byte(`{"projectConfigId":"missing","chatSectionId":"chat-section"}`)))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "project_config_not_found" {
		t.Fatalf("expected project_config_not_found, got %#v", payload)
	}
}

func TestRegisterAgenticSummaryCacheRoutesReturnsChatNotFound(t *testing.T) {
	t.Parallel()

	projectRuntime := newAgenticSummaryCacheRouteRuntime(t, agenticSummaryCacheRouteTestDocument())
	service := newAgenticSummaryCacheRouteService(t)
	handler := newAgenticSummaryCacheRouteHandler(t, config.ModeIDE, projectRuntime, service)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgenticSummaryCacheStatus, bytes.NewReader([]byte(`{"projectConfigId":"project-alpha","chatSectionId":"missing-chat"}`)))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "chat_section_not_found" {
		t.Fatalf("expected chat_section_not_found, got %#v", payload)
	}
}

func TestRegisterAgenticSummaryCacheRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	projectRuntime := newAgenticSummaryCacheRouteRuntime(t, agenticSummaryCacheRouteTestDocument())
	service := newAgenticSummaryCacheRouteService(t)
	handler := newAgenticSummaryCacheRouteHandler(t, config.ModeShare, projectRuntime, service)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgenticSummaryCacheStatus, bytes.NewReader([]byte(`{"projectConfigId":"project-alpha","chatSectionId":"chat-section"}`)))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
}

func newAgenticSummaryCacheRouteHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	service *agenticsummarycache.Service,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAgenticSummaryCacheRoutes(r, AgenticSummaryCacheRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				ProjectState: projectRuntime,
				Statuses:     service,
			}); err != nil {
				t.Fatalf("register summary cache routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newAgenticSummaryCacheRouteRuntime(t *testing.T, document projectstate.Document) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})
	return runtime
}

func newAgenticSummaryCacheRouteService(t *testing.T) *agenticsummarycache.Service {
	t.Helper()

	service, err := agenticsummarycache.NewService(t.TempDir())
	if err != nil {
		t.Fatalf("new summary cache service: %v", err)
	}
	return service
}

func writeAgenticSummaryCacheRouteTestEntries(t *testing.T, path string, entries map[string]any) {
	t.Helper()

	payload := map[string]any{
		"version": 1,
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

func agenticSummaryCacheRouteTestDocument() projectstate.Document {
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
		AgenticEdges: []projectstate.AgenticEdge{
			{
				ID:              "chat-to-source",
				SourceSectionID: "chat-section",
				TargetSectionID: "source-section",
				Kind:            "chat_section",
				ContextMode:     "summary",
			},
		},
	}
	project = addAgenticSummaryCacheRouteSection(project, "chat-section", "Chat", map[string]any{
		"id":   "chat-impl",
		"type": "Chat",
	})
	project = addAgenticSummaryCacheRouteSection(project, "source-section", "TextBlock", map[string]any{
		"id":   "source-impl",
		"type": "TextBlock",
		"text": "hello",
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	}
}

func addAgenticSummaryCacheRouteSection(project projectstate.Project, sectionID string, sectionType string, payload map[string]any) projectstate.Project {
	variantID := sectionID + "-variant"
	implID := payload["id"].(string)
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
		Payload: mustMarshalAgenticSummaryCacheRouteJSON(payload),
	}
	project.SectionVariantMap[sectionID] = variantID
	return project
}

func mustMarshalAgenticSummaryCacheRouteJSON(value map[string]any) projectstate.RawJSON {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}
