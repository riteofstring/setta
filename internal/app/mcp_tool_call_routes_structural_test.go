package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppIDEMCPToolCallRouteSupportsStructuralCreate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"create_top_level_section",
			"arguments":{"projectConfigId":"project-alpha","implType":"Dict"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post structural create tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode structural create tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected structural create success, got %#v", payload.StructuredContent)
	}

	structured := mustStructuredMapValue(t, payload.StructuredContent)
	sectionID, ok := structured["sectionId"].(string)
	if !ok || strings.TrimSpace(sectionID) == "" {
		t.Fatalf("expected created section id, got %#v", structured["sectionId"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route structural create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section, got %#v", project.Sections)
	}
	if sectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionID]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", sectionID)
	}
}

func TestAppIDEMCPToolCallRouteSupportsStructuralChildCreate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"create_child_sections",
			"arguments":{"projectConfigId":"project-alpha","parentId":"allowed-section","implType":"Terminal","numChildren":1},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post structural child create tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode structural child create tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected structural child create success, got %#v", payload.StructuredContent)
	}

	structured := mustStructuredMapValue(t, payload.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created child id, got %#v", sectionIDs)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route structural child create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical child section, got %#v", project.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := project.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetCodeSectionAttachedTerminal(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	terminalSectionID := mustSeedAppTopLevelTerminal(t, app.ProjectStates().Main())

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_section_attached_terminal",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","terminalSectionId":"`+terminalSectionID+`"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code_section_attached_terminal tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code_section_attached_terminal tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code_section_attached_terminal success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_section_attached_terminal: %v", err)
	}
	_, _, codeImpl, err := project.ResolveSection("allowed-section")
	if err != nil {
		t.Fatalf("resolve allowed section after route attach: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal %q after route mutation, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionSizes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_sizes",
			"arguments":{"projectConfigId":"project-alpha","sectionSizes":{"allowed-section":{"width":480,"height":220}}},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_sizes tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_sizes tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_sizes success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_sizes: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.SectionImpls["allowed-impl"].Payload)
	size := mustStructuredMapValue(t, allowedPayload["size"])
	if size["width"] != 480.0 || size["height"] != 220.0 {
		t.Fatalf("expected allowed-section size {480 220} after route mutation, got %#v", size)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetGroupOverflowMode(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustAddAppScopedMCPGroupSection(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_group_overflow_mode",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"group-section","overflowMode":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_group_overflow_mode tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_group_overflow_mode tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_group_overflow_mode success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_group_overflow_mode: %v", err)
	}
	groupPayload := mustDecodedProjectPayloadValue(t, project.Sections["group-section"].SharedModifier)
	if overflow, _ := groupPayload["overflowMode"].(bool); !overflow {
		t.Fatal("expected group-section overflowMode=true after route mutation")
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionVariant(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustAddAppScopedMCPAlternateSectionVariant(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_variant",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section",
				"variantId":"allowed-variant-alt"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_variant tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_variant tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_variant success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section active variant to be updated, got %q", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetDefaultSectionVariant(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustAddAppScopedMCPAlternateSectionVariant(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_default_section_variant",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section",
				"variantId":"allowed-variant-alt"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_default_section_variant tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_default_section_variant tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_default_section_variant success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section default variant to be updated, got %q", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionVariantSortOrder(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustAddAppScopedMCPAlternateSectionVariant(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_variant_sort_order",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section",
				"orderedVariantIds":["allowed-variant-alt","allowed-variant"]
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_variant_sort_order tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_variant_sort_order tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_variant_sort_order success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}
}

func TestAppIDEMCPToolCallRouteSupportsIncrementerStructuralChildCreate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route incrementer structural child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"create_child_sections_via_incrementer",
			"arguments":{"projectConfigId":"project-alpha","calledBy":"allowed-section","implType":"Terminal","numChildren":1},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post incrementer structural child create tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode incrementer structural child create tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected incrementer structural child create success, got %#v", payload.StructuredContent)
	}

	structured := mustStructuredMapValue(t, payload.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created incrementer child id, got %#v", sectionIDs)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route incrementer structural child create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical incrementer child section, got %#v", project.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated incrementer child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated incrementer child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := project.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
	}
}
