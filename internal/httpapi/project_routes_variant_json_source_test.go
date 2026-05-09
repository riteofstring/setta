package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesSetVariantJSONSourceKeysRefreshesLiveTreeWithoutPersistingExistingFileSelection(t *testing.T) {
	t.Parallel()

	workspaceRoot, _, store, projectRuntime := newProjectRouteJSONSourceRuntime(
		t,
		jsonSourceLiveRefreshRouteTestDocument(t),
		`{"beta":{"second":2,"first":[1,true]}}
`,
	)
	postProjectRouteSetVariantJSONSourceKeys(
		t,
		projectRuntime,
		workspaceRoot,
		`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["beta"],"frontendOpId":"frontend-op-json-source-refresh"}`,
	)

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	assertProjectRouteJSONSourceLiveBetaTree(t, project, "json-section", "json-variant-a", "old-root")
	assertProjectRouteCompletedFrontendOps(t, projectRuntime, "frontend-op-json-source-refresh")
	assertProjectRoutePersistedJSONSourceSelection(t, store)
}

func TestRegisterProjectRoutesSetVariantJSONSourceKeysReassignsLiveRootWhenCurrentRootIsLeaf(t *testing.T) {
	t.Parallel()

	workspaceRoot, _, _, projectRuntime := newProjectRouteJSONSourceRuntime(
		t,
		jsonSourceLeafRootRouteTestDocument(t),
		`{"beta":{"second":2,"first":[1,true]}}
`,
	)
	postProjectRouteSetVariantJSONSourceKeys(
		t,
		projectRuntime,
		workspaceRoot,
		`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["beta"],"frontendOpId":"frontend-op-json-source-root-reassign"}`,
	)

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	payload := mustProjectRouteEffectiveSectionPayload(t, project, "json-section", "json-variant-a")
	topLevelParamID := projectstatePayloadString(payload, "topLevelParamId")
	if topLevelParamID == "old-leaf" {
		t.Fatalf("expected live refresh to replace leaf root old-leaf, got %q", topLevelParamID)
	}
	codeObjVariantMap := projectstatePayloadStringMap(payload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap["old-leaf"]; ok {
		t.Fatalf("expected old leaf root to be pruned from live map, got %#v", codeObjVariantMap)
	}
	assertProjectRouteJSONSourceBetaChildren(t, project, codeObjVariantMap, topLevelParamID, "root reassignment")
}

func TestRegisterProjectRoutesSetVariantJSONSourceKeysKeepsLoadedTreeWhenBackingFileDisappears(t *testing.T) {
	t.Parallel()

	workspaceRoot, sourcePath, store, projectRuntime := newProjectRouteJSONSourceRuntime(
		t,
		jsonSourceSharedRouteTestDocument(t),
		`{"alpha":{"fresh":2}}
`,
	)
	loadProjectRouteJSONSourceVariantsFromDisk(t, projectRuntime, workspaceRoot)
	if err := os.Remove(sourcePath); err != nil {
		t.Fatalf("remove json source payload: %v", err)
	}

	postProjectRouteSetVariantJSONSourceKeys(
		t,
		projectRuntime,
		workspaceRoot,
		`{"projectConfigId":"project-alpha","sectionId":"json-section-a","variantId":"json-variant-a","jsonSourceKeys":["alpha"],"frontendOpId":"frontend-op-json-source-missing-noop"}`,
	)

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	assertProjectRouteJSONSourceMissingLiveProject(t, project)
	assertProjectRouteCompletedFrontendOps(t, projectRuntime, "frontend-op-json-source-missing-noop")

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("LoadRaw after missing-file reload: %v", err)
	}
	assertProjectRouteJSONSourceMissingPersistedProject(t, persistedDocument.Projects["project-alpha"])
}

func TestRegisterProjectRoutesSectionVariantMutationsUseDeploymentOverlayWhenVariantChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newProjectRouteSectionVariantDeploymentRuntime(t, mode, true)
			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			doRequest := newProjectRouteDeploymentPost(handler)
			baseBefore := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]

			createdVariantID := createProjectRouteDeploymentSectionVariant(t, doRequest)
			postProjectRouteDeploymentVariantMutations(t, doRequest, createdVariantID)

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			assertProjectRouteOverlayVariantMutations(t, overlay.Snapshot().Document.Projects["project-alpha"], createdVariantID)
			assertProjectRouteBaseVariantState(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"], baseBefore, createdVariantID)
		})
	}
}

func TestRegisterProjectRoutesSectionVariantMutationsRejectDeploymentPolicyWhenVariantChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": sectionVariantRouteTestProject(t, true),
					},
				},
				Policy: map[string]any{
					"allowVariantChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay before rejected variant mutations: %v", err)
			}
			before := overlay.Snapshot().Document.Projects["project-alpha"]

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			assertForbidden := func(t *testing.T, response *httptest.ResponseRecorder, route string) {
				t.Helper()
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"variant_changes_forbidden"`) {
					t.Fatalf("expected variant_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows variant changes.") {
					t.Fatalf("expected deployment variant policy denial, got %q", response.Body.String())
				}
			}

			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteCreateNewSectionVariant,
					body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","frontendOpId":"frontend-op-create-variant"}`,
				},
				{
					route: RouteSetSectionVariant,
					body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-variant"}`,
				},
				{
					route: RouteSetDefaultSectionVariant,
					body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-default"}`,
				},
				{
					route: RouteSetSectionVariantSortOrder,
					body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a","source-variant-b"],"frontendOpId":"frontend-op-sort-variants"}`,
				},
				{
					route: RouteSetSectionVariantName,
					body:  `{"projectConfigId":"project-alpha","variantId":"source-variant-a","name":"Renamed Variant","frontendOpId":"frontend-op-rename-variant"}`,
				},
				{
					route: RouteToggleVariantFrozen,
					body:  `{"projectConfigId":"project-alpha","variantId":"source-variant-a","frontendOpId":"frontend-op-freeze-variant"}`,
				},
				{
					route: RouteToggleVariantJSONSource,
					body:  `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","frontendOpId":"frontend-op-toggle-json-source"}`,
				},
				{
					route: RouteSetVariantJSONSourceKeys,
					body:  `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","jsonSourceKeys":["config","nested"],"frontendOpId":"frontend-op-json-source-keys"}`,
				},
			} {
				request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				assertForbidden(t, response, requestSpec.route)
			}

			after := overlay.Snapshot().Document.Projects["project-alpha"]
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("expected rejected overlay variant mutations to leave project unchanged, got %#v", after)
			}
		})
	}
}

func newProjectRouteJSONSourceRuntime(t *testing.T, document projectstate.Document, sourcePayload string) (string, string, *projectstate.Store, *projectstate.Runtime) {
	t.Helper()

	workspaceRoot := t.TempDir()
	dataDir := filepath.Join(workspaceRoot, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	sourcePath := filepath.Join(dataDir, "source.json")
	if err := os.WriteFile(sourcePath, []byte(sourcePayload), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	store, err := projectstate.NewStore(filepath.Join(t.TempDir(), "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial project document: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open persisted runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close persisted runtime: %v", err)
		}
	})
	return workspaceRoot, sourcePath, store, projectRuntime
}

func postProjectRouteSetVariantJSONSourceKeys(t *testing.T, projectRuntime *projectstate.Runtime, workspaceRoot string, body string) {
	t.Helper()

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetVariantJSONSourceKeys, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
}

func loadProjectRouteJSONSourceVariantsFromDisk(t *testing.T, projectRuntime *projectstate.Runtime, workspaceRoot string) {
	t.Helper()

	if _, err := projectRuntime.MutateWithContext(
		context.Background(),
		func(document projectstate.Document) (projectstate.Document, error) {
			if err := document.LoadAllJSONSourceVariantsFromDisk(workspaceRoot); err != nil {
				return document, err
			}
			return document, nil
		},
	); err != nil {
		t.Fatalf("startup-like json-source load: %v", err)
	}
}

func mustProjectRouteEffectiveSectionPayload(t *testing.T, project projectstate.Project, sectionID string, variantID string) map[string]any {
	t.Helper()

	payload, err := project.EffectiveSectionPayload(sectionID, variantID)
	if err != nil {
		t.Fatalf("effective payload for %s/%s: %v", sectionID, variantID, err)
	}
	return payload
}

func assertProjectRouteJSONSourceLiveBetaTree(t *testing.T, project projectstate.Project, sectionID string, variantID string, topLevelParamID string) {
	t.Helper()

	payload := mustProjectRouteEffectiveSectionPayload(t, project, sectionID, variantID)
	rawKeys, _ := payload["jsonSourceKeys"].([]any)
	if len(rawKeys) != 1 || rawKeys[0] != "alpha" {
		t.Fatalf("expected live jsonSourceKeys to remain [alpha], got %#v", rawKeys)
	}
	codeObjVariantMap := projectstatePayloadStringMap(payload, "codeObjVariantMap")
	if len(codeObjVariantMap) != 3 {
		t.Fatalf("expected live codeObjVariantMap size 3, got %#v", codeObjVariantMap)
	}
	if _, ok := project.CodeObjs["old-leaf"]; ok {
		t.Fatalf("expected live old-leaf to be pruned, got %#v", project.CodeObjs["old-leaf"])
	}
	assertProjectRouteJSONSourceBetaChildren(t, project, codeObjVariantMap, topLevelParamID, "live refresh")
}

func assertProjectRouteJSONSourceBetaChildren(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, rootParamID string, contextLabel string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, rootParamID)
	if err != nil {
		t.Fatalf("effective root payload after %s: %v", contextLabel, err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected %s root children [second first], got %#v", contextLabel, childIDs)
	}
	assertProjectRouteJSONSourceChild(t, project, codeObjVariantMap, childIDs[0], "second", "2", contextLabel)
	assertProjectRouteJSONSourceChild(t, project, codeObjVariantMap, childIDs[1], "first", "[1,true]", contextLabel)
}

func assertProjectRouteJSONSourceChild(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, childID string, expectedName string, expectedValue string, contextLabel string) {
	t.Helper()

	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childID)
	if err != nil {
		t.Fatalf("effective %s child after %s: %v", expectedName, contextLabel, err)
	}
	if childCodeObj.Name != expectedName {
		t.Fatalf("expected %s child to be named %s, got %q", contextLabel, expectedName, childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != expectedValue {
		t.Fatalf("expected %s child value %s, got %q", expectedName, expectedValue, got)
	}
}

func assertProjectRouteCompletedFrontendOps(t *testing.T, projectRuntime *projectstate.Runtime, expected string) {
	t.Helper()

	_, frontendOps, err := projectRuntime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("SnapshotAndConsumeFrontendOps after mutation: %v", err)
	}
	if len(frontendOps.Completed) != 1 || frontendOps.Completed[0] != expected {
		t.Fatalf("expected completed frontend op %s, got %#v", expected, frontendOps.Completed)
	}
}

func assertProjectRoutePersistedJSONSourceSelection(t *testing.T, store *projectstate.Store) {
	t.Helper()

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("LoadRaw after live json-source refresh: %v", err)
	}
	persistedProject := persistedDocument.Projects["project-alpha"]
	persistedPayload := mustProjectRouteEffectiveSectionPayload(t, persistedProject, "json-section", "json-variant-a")
	persistedRawKeys, _ := persistedPayload["jsonSourceKeys"].([]any)
	if len(persistedRawKeys) != 1 || persistedRawKeys[0] != "alpha" {
		t.Fatalf("expected persisted jsonSourceKeys [alpha], got %#v", persistedRawKeys)
	}
	persistedCodeObjVariantMap := projectstatePayloadStringMap(persistedPayload, "codeObjVariantMap")
	if len(persistedCodeObjVariantMap) != 2 {
		t.Fatalf("expected persisted codeObjVariantMap size 2, got %#v", persistedCodeObjVariantMap)
	}
	if _, ok := persistedProject.CodeObjs["old-leaf"]; !ok {
		t.Fatalf("expected persisted old-leaf to remain present, got %#v", persistedProject.CodeObjs)
	}
}

func assertProjectRouteJSONSourceMissingLiveProject(t *testing.T, project projectstate.Project) {
	t.Helper()

	targetPayload := mustProjectRouteEffectiveSectionPayload(t, project, "json-section-a", "json-variant-a")
	peerPayload := mustProjectRouteEffectiveSectionPayload(t, project, "json-section-b", "json-variant-b")
	assertProjectRouteJSONSourceMissingFlagClear(t, targetPayload, "target")
	assertProjectRouteJSONSourceMissingFlagClear(t, peerPayload, "peer")
	assertProjectRouteJSONSourceFreshValue(t, project, projectstatePayloadStringMap(targetPayload, "codeObjVariantMap"), projectstatePayloadString(targetPayload, "topLevelParamId"))
	assertProjectRouteJSONSourceFreshValue(t, project, projectstatePayloadStringMap(peerPayload, "codeObjVariantMap"), projectstatePayloadString(peerPayload, "topLevelParamId"))
}

func assertProjectRouteJSONSourceMissingPersistedProject(t *testing.T, project projectstate.Project) {
	t.Helper()

	targetPayload := mustProjectRouteEffectiveSectionPayload(t, project, "json-section-a", "json-variant-a")
	peerPayload := mustProjectRouteEffectiveSectionPayload(t, project, "json-section-b", "json-variant-b")
	assertProjectRouteJSONSourceMissingFlagClear(t, targetPayload, "persisted target")
	assertProjectRouteJSONSourceMissingFlagClear(t, peerPayload, "persisted peer")
	assertProjectRouteJSONSourceOldLeafValue(t, project, projectstatePayloadStringMap(targetPayload, "codeObjVariantMap"), projectstatePayloadString(targetPayload, "topLevelParamId"), "target-leaf", "1")
	assertProjectRouteJSONSourceOldLeafValue(t, project, projectstatePayloadStringMap(peerPayload, "codeObjVariantMap"), projectstatePayloadString(peerPayload, "topLevelParamId"), "peer-leaf", "2")
}

func assertProjectRouteJSONSourceMissingFlagClear(t *testing.T, payload map[string]any, label string) {
	t.Helper()

	if projectstatePayloadBool(payload, "jsonSourceMissing") {
		t.Fatalf("expected %s missing flag to remain false", label)
	}
}

type projectRouteDeploymentPost func(route string, body string) *httptest.ResponseRecorder

func newProjectRouteSectionVariantDeploymentRuntime(t *testing.T, mode config.Mode, allowVariantChanges bool) *deployments.Runtime {
	t.Helper()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode: mode,
		Document: projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": sectionVariantRouteTestProject(t, true),
			},
		},
		Policy: map[string]any{
			"allowVariantChanges": allowVariantChanges,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create deployment session: %v", err)
	}
	return deploymentRuntime
}

func newProjectRouteDeploymentPost(handler http.Handler) projectRouteDeploymentPost {
	return func(route string, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set(modes.ShareSessionHeaderName, "share-a")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
}

func createProjectRouteDeploymentSectionVariant(t *testing.T, doRequest projectRouteDeploymentPost) string {
	t.Helper()

	createResponse := doRequest(
		RouteCreateNewSectionVariant,
		`{"projectConfigId":"project-alpha","sectionId":"source-section","frontendOpId":"frontend-op-create-variant"}`,
	)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for createNewSectionVariant, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	var created CreateNewSectionVariantResponse
	if err := json.Unmarshal(createResponse.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode createNewSectionVariant response: %v", err)
	}
	if strings.TrimSpace(created.VariantID) == "" {
		t.Fatal("expected createNewSectionVariant to return a variant id")
	}
	return created.VariantID
}

func postProjectRouteDeploymentVariantMutations(t *testing.T, doRequest projectRouteDeploymentPost, createdVariantID string) {
	t.Helper()

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{route: RouteSetSectionVariant, body: `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-variant"}`},
		{route: RouteSetDefaultSectionVariant, body: `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-default"}`},
		{route: RouteSetSectionVariantSortOrder, body: fmt.Sprintf(`{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a",%q,"source-variant-b"],"frontendOpId":"frontend-op-sort-variants"}`, createdVariantID)},
		{route: RouteSetSectionVariantName, body: `{"projectConfigId":"project-alpha","variantId":"source-variant-a","name":"Renamed Variant","frontendOpId":"frontend-op-rename-variant"}`},
		{route: RouteToggleVariantFrozen, body: `{"projectConfigId":"project-alpha","variantId":"source-variant-a","frontendOpId":"frontend-op-freeze-variant"}`},
		{route: RouteToggleVariantJSONSource, body: `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","frontendOpId":"frontend-op-toggle-json-source"}`},
		{route: RouteSetVariantJSONSourceKeys, body: `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","jsonSourceKeys":["config","nested"],"frontendOpId":"frontend-op-json-source-keys"}`},
	} {
		response := doRequest(requestSpec.route, requestSpec.body)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}
}

func assertProjectRouteOverlayVariantMutations(t *testing.T, project projectstate.Project, createdVariantID string) {
	t.Helper()

	if _, ok := project.SectionVariants[createdVariantID]; !ok {
		t.Fatalf("expected created overlay variant %q to persist", createdVariantID)
	}
	if got := project.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected overlay active variant source-variant-a, got %q", got)
	}
	if got := project.Sections["source-section"].DefaultVariantID; got != "source-variant-a" {
		t.Fatalf("expected overlay default variant source-variant-a, got %q", got)
	}
	if got := project.Sections["source-section"].VariantIDs; len(got) != 3 || got[0] != "source-variant-a" || got[1] != createdVariantID || got[2] != "source-variant-b" {
		t.Fatalf("expected overlay source-section variants [source-variant-a %s source-variant-b], got %#v", createdVariantID, got)
	}
	if got := project.SectionVariants["source-variant-a"].Name; got != "Renamed Variant" {
		t.Fatalf("expected overlay source-variant-a name Renamed Variant, got %q", got)
	}
	if !project.SectionVariants["source-variant-a"].IsFrozen {
		t.Fatal("expected overlay source-variant-a to be frozen after toggle")
	}
	assertProjectRouteJSONVariantPayload(t, project, "json", []any{"config", "nested"}, true, "overlay")
}

func assertProjectRouteBaseVariantState(t *testing.T, project projectstate.Project, before projectstate.Project, createdVariantID string) {
	t.Helper()

	if _, ok := project.SectionVariants[createdVariantID]; ok {
		t.Fatalf("expected base project not to persist created variant %q", createdVariantID)
	}
	if !reflect.DeepEqual(project, before) {
		t.Fatalf("expected base project to remain unchanged, got %#v", project)
	}
	assertProjectRouteJSONVariantPayload(t, project, "python", nil, false, "base")
}

func assertProjectRouteJSONVariantPayload(t *testing.T, project projectstate.Project, expectedLanguage string, expectedKeys []any, expectedJSONSource bool, label string) {
	t.Helper()

	payload := mustProjectRouteEffectiveSectionPayload(t, project, "json-section", "json-variant-b")
	isJSONSource, _ := payload["isJsonSource"].(bool)
	if isJSONSource != expectedJSONSource {
		t.Fatalf("expected %s json-variant-b json-source flag %t, got %t", label, expectedJSONSource, isJSONSource)
	}
	configLanguage, _ := payload["configLanguage"].(string)
	if configLanguage != expectedLanguage {
		t.Fatalf("expected %s json-variant-b configLanguage %s, got %q", label, expectedLanguage, configLanguage)
	}
	rawKeys, _ := payload["jsonSourceKeys"].([]any)
	if expectedKeys == nil && len(rawKeys) == 0 {
		return
	}
	if !reflect.DeepEqual(rawKeys, expectedKeys) {
		t.Fatalf("expected %s json-variant-b jsonSourceKeys %#v, got %#v", label, expectedKeys, rawKeys)
	}
}
