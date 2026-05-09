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
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesSetVariantJSONSourceKeysRefreshesLiveTreeWithoutPersistingExistingFileSelection(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2,\"first\":[1,true]}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	storePath := filepath.Join(t.TempDir(), "project.json")
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceLiveRefreshRouteTestDocument(t)); err != nil {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["beta"],"frontendOpId":"frontend-op-json-source-refresh"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	payload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("effective payload after live json-source refresh: %v", err)
	}
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
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, "old-root")
	if err != nil {
		t.Fatalf("effective root payload after live refresh: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected live root children [second first], got %#v", childIDs)
	}
	secondPayload, secondCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective second payload after live refresh: %v", err)
	}
	if secondCodeObj.Name != "second" {
		t.Fatalf("expected first live child to be named second, got %q", secondCodeObj.Name)
	}
	if got := projectstatePayloadString(secondPayload, "value"); got != "2" {
		t.Fatalf("expected live second child value 2, got %q", got)
	}
	firstPayload, firstCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[1])
	if err != nil {
		t.Fatalf("effective first payload after live refresh: %v", err)
	}
	if firstCodeObj.Name != "first" {
		t.Fatalf("expected second live child to be named first, got %q", firstCodeObj.Name)
	}
	if got := projectstatePayloadString(firstPayload, "value"); got != "[1,true]" {
		t.Fatalf("expected live first child value [1,true], got %q", got)
	}

	_, frontendOps, err := projectRuntime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("SnapshotAndConsumeFrontendOps after live refresh: %v", err)
	}
	if len(frontendOps.Completed) != 1 || frontendOps.Completed[0] != "frontend-op-json-source-refresh" {
		t.Fatalf("expected completed frontend op frontend-op-json-source-refresh, got %#v", frontendOps.Completed)
	}

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("LoadRaw after live json-source refresh: %v", err)
	}
	persistedProject := persistedDocument.Projects["project-alpha"]
	persistedPayload, err := persistedProject.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("persisted effective payload after live refresh: %v", err)
	}
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

func TestRegisterProjectRoutesSetVariantJSONSourceKeysReassignsLiveRootWhenCurrentRootIsLeaf(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2,\"first\":[1,true]}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	storePath := filepath.Join(t.TempDir(), "project.json")
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceLeafRootRouteTestDocument(t)); err != nil {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","jsonSourceKeys":["beta"],"frontendOpId":"frontend-op-json-source-root-reassign"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	payload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("effective payload after live json-source root reassignment: %v", err)
	}
	topLevelParamID := projectstatePayloadString(payload, "topLevelParamId")
	if topLevelParamID == "old-leaf" {
		t.Fatalf("expected live refresh to replace leaf root old-leaf, got %q", topLevelParamID)
	}
	codeObjVariantMap := projectstatePayloadStringMap(payload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap["old-leaf"]; ok {
		t.Fatalf("expected old leaf root to be pruned from live map, got %#v", codeObjVariantMap)
	}
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective reassigned root payload after refresh: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected reassigned root children [second first], got %#v", childIDs)
	}
	secondPayload, secondCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective second payload after root reassignment: %v", err)
	}
	if secondCodeObj.Name != "second" {
		t.Fatalf("expected first child to be named second, got %q", secondCodeObj.Name)
	}
	if got := projectstatePayloadString(secondPayload, "value"); got != "2" {
		t.Fatalf("expected second child value 2, got %q", got)
	}
	firstPayload, firstCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[1])
	if err != nil {
		t.Fatalf("effective first payload after root reassignment: %v", err)
	}
	if firstCodeObj.Name != "first" {
		t.Fatalf("expected second child to be named first, got %q", firstCodeObj.Name)
	}
	if got := projectstatePayloadString(firstPayload, "value"); got != "[1,true]" {
		t.Fatalf("expected first child value [1,true], got %q", got)
	}
}

func TestRegisterProjectRoutesSetVariantJSONSourceKeysKeepsLoadedTreeWhenBackingFileDisappears(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	sourcePath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.WriteFile(sourcePath, []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	storePath := filepath.Join(t.TempDir(), "project.json")
	store, err := projectstate.NewStore(storePath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), jsonSourceSharedRouteTestDocument(t)); err != nil {
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
	if err := os.Remove(sourcePath); err != nil {
		t.Fatalf("remove json source payload: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section-a","variantId":"json-variant-a","jsonSourceKeys":["alpha"],"frontendOpId":"frontend-op-json-source-missing-noop"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after missing-file reload: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after missing-file reload: %v", err)
	}
	if projectstatePayloadBool(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target missing flag to remain false")
	}
	if projectstatePayloadBool(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer missing flag to remain false")
	}
	assertProjectRouteJSONSourceFreshValue(t, project, projectstatePayloadStringMap(targetPayload, "codeObjVariantMap"), projectstatePayloadString(targetPayload, "topLevelParamId"))
	assertProjectRouteJSONSourceFreshValue(t, project, projectstatePayloadStringMap(peerPayload, "codeObjVariantMap"), projectstatePayloadString(peerPayload, "topLevelParamId"))

	_, frontendOps, err := projectRuntime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("SnapshotAndConsumeFrontendOps after missing-file reload: %v", err)
	}
	if len(frontendOps.Completed) != 1 || frontendOps.Completed[0] != "frontend-op-json-source-missing-noop" {
		t.Fatalf("expected completed frontend op frontend-op-json-source-missing-noop, got %#v", frontendOps.Completed)
	}

	persistedDocument, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("LoadRaw after missing-file reload: %v", err)
	}
	persistedProject := persistedDocument.Projects["project-alpha"]
	persistedTargetPayload, err := persistedProject.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("persisted target payload after missing-file reload: %v", err)
	}
	persistedPeerPayload, err := persistedProject.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("persisted peer payload after missing-file reload: %v", err)
	}
	if projectstatePayloadBool(persistedTargetPayload, "jsonSourceMissing") {
		t.Fatal("expected persisted target missing flag to remain false")
	}
	if projectstatePayloadBool(persistedPeerPayload, "jsonSourceMissing") {
		t.Fatal("expected persisted peer missing flag to remain false")
	}
	assertProjectRouteJSONSourceOldLeafValue(t, persistedProject, projectstatePayloadStringMap(persistedTargetPayload, "codeObjVariantMap"), projectstatePayloadString(persistedTargetPayload, "topLevelParamId"), "target-leaf", "1")
	assertProjectRouteJSONSourceOldLeafValue(t, persistedProject, projectstatePayloadStringMap(persistedPeerPayload, "codeObjVariantMap"), projectstatePayloadString(persistedPeerPayload, "topLevelParamId"), "peer-leaf", "2")
}

func TestRegisterProjectRoutesSectionVariantMutationsUseDeploymentOverlayWhenVariantChangesAllowed(t *testing.T) {
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
					"allowVariantChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			doRequest := func(route string, body string) *httptest.ResponseRecorder {
				t.Helper()
				request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				return response
			}

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

			for _, requestSpec := range []struct {
				route string
				body  string
			}{
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
					body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a",%q,"source-variant-b"],"frontendOpId":"frontend-op-sort-variants"}`, created.VariantID),
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
				response := doRequest(requestSpec.route, requestSpec.body)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
				}
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if _, ok := overlayProject.SectionVariants[created.VariantID]; !ok {
				t.Fatalf("expected created overlay variant %q to persist", created.VariantID)
			}
			if got := overlayProject.SectionVariantMap["source-section"]; got != "source-variant-a" {
				t.Fatalf("expected overlay active variant source-variant-a, got %q", got)
			}
			if got := overlayProject.Sections["source-section"].DefaultVariantID; got != "source-variant-a" {
				t.Fatalf("expected overlay default variant source-variant-a, got %q", got)
			}
			if got := overlayProject.Sections["source-section"].VariantIDs; len(got) != 3 || got[0] != "source-variant-a" || got[1] != created.VariantID || got[2] != "source-variant-b" {
				t.Fatalf("expected overlay source-section variants [source-variant-a %s source-variant-b], got %#v", created.VariantID, got)
			}
			if got := overlayProject.SectionVariants["source-variant-a"].Name; got != "Renamed Variant" {
				t.Fatalf("expected overlay source-variant-a name Renamed Variant, got %q", got)
			}
			if !overlayProject.SectionVariants["source-variant-a"].IsFrozen {
				t.Fatal("expected overlay source-variant-a to be frozen after toggle")
			}
			overlayPayload, err := overlayProject.EffectiveSectionPayload("json-section", "json-variant-b")
			if err != nil {
				t.Fatalf("overlay effective payload after json-source mutations: %v", err)
			}
			overlayIsJSONSource, _ := overlayPayload["isJsonSource"].(bool)
			if !overlayIsJSONSource {
				t.Fatal("expected overlay json-variant-b payload to enable json source")
			}
			overlayConfigLanguage, _ := overlayPayload["configLanguage"].(string)
			if overlayConfigLanguage != "json" {
				t.Fatalf("expected overlay json-variant-b configLanguage json, got %q", overlayConfigLanguage)
			}
			overlayRawKeys, _ := overlayPayload["jsonSourceKeys"].([]any)
			if len(overlayRawKeys) != 2 || overlayRawKeys[0] != "config" || overlayRawKeys[1] != "nested" {
				t.Fatalf("expected overlay json-variant-b jsonSourceKeys [config nested], got %#v", overlayRawKeys)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if _, ok := baseProject.SectionVariants[created.VariantID]; ok {
				t.Fatalf("expected base project not to persist created variant %q", created.VariantID)
			}
			if got := baseProject.SectionVariantMap["source-section"]; got != "source-variant-b" {
				t.Fatalf("expected base active variant source-variant-b, got %q", got)
			}
			if got := baseProject.Sections["source-section"].DefaultVariantID; got != "source-variant-b" {
				t.Fatalf("expected base default variant source-variant-b, got %q", got)
			}
			if got := baseProject.Sections["source-section"].VariantIDs; len(got) != 2 || got[0] != "source-variant-a" || got[1] != "source-variant-b" {
				t.Fatalf("expected base source-section variants unchanged, got %#v", got)
			}
			if got := baseProject.SectionVariants["source-variant-a"].Name; got != "" {
				t.Fatalf("expected base source-variant-a name unchanged, got %q", got)
			}
			if baseProject.SectionVariants["source-variant-a"].IsFrozen {
				t.Fatal("expected base source-variant-a frozen flag unchanged")
			}
			basePayload, err := baseProject.EffectiveSectionPayload("json-section", "json-variant-b")
			if err != nil {
				t.Fatalf("base effective payload after overlay json-source mutations: %v", err)
			}
			baseIsJSONSource, _ := basePayload["isJsonSource"].(bool)
			if baseIsJSONSource {
				t.Fatal("expected base json-variant-b payload to remain non-json-source")
			}
			baseConfigLanguage, _ := basePayload["configLanguage"].(string)
			if baseConfigLanguage != "python" {
				t.Fatalf("expected base json-variant-b configLanguage python, got %q", baseConfigLanguage)
			}
			baseRawKeys, _ := basePayload["jsonSourceKeys"].([]any)
			if len(baseRawKeys) != 0 {
				t.Fatalf("expected base json-variant-b jsonSourceKeys unchanged, got %#v", baseRawKeys)
			}
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

func TestRegisterProjectRoutesReturnsCompletedFrontendOpIDsAfterMutation(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	// A successful mutation should mark the frontend op completed in the next
	// hydrate payload so optimistic state can clear deterministically.
	mutateRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewport,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"frontend-op-1","viewport":{"x":15,"y":25,"zoom":1.25}}`),
	)
	mutateRequest.Header.Set("Content-Type", "application/json")
	mutateResponse := httptest.NewRecorder()
	handler.ServeHTTP(mutateResponse, mutateRequest)
	if mutateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from setViewport, got %d with body %q", mutateResponse.Code, mutateResponse.Body.String())
	}

	latestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from getLatestProjectState, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if !reflect.DeepEqual(payload.CompletedOpIDs, []string{"frontend-op-1"}) {
		t.Fatalf("expected completed frontend op id [frontend-op-1], got %#v", payload.CompletedOpIDs)
	}
	if len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending frontend op ids, got %#v", payload.PendingOpIDs)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil || payload.ProjectState.ProjectConfig.Viewport.X != 15 {
		t.Fatalf("expected updated viewport in hydrate payload, got %#v", payload.ProjectState.ProjectConfig.Viewport)
	}

	// Completed ids are one-shot metadata and should be cleared after the hydrate
	// that exposes them.
	secondLatestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	secondLatestRequest.Header.Set("Content-Type", "application/json")
	secondLatestResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondLatestResponse, secondLatestRequest)
	if secondLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected second 200 from getLatestProjectState, got %d with body %q", secondLatestResponse.Code, secondLatestResponse.Body.String())
	}
	if err := json.Unmarshal(secondLatestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode second latest project state payload: %v", err)
	}
	if len(payload.CompletedOpIDs) != 0 {
		t.Fatalf("expected completed frontend op ids to clear after hydration, got %#v", payload.CompletedOpIDs)
	}
}

func TestRegisterProjectRoutesSetCodeInvokesServiceAndReturnsOK(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	var captured projectRouteSetCodeCall
	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			setCode: func(_ context.Context, projectID string, sectionID string, code string) error {
				captured = projectRouteSetCodeCall{
					ProjectID: projectID,
					SectionID: sectionID,
					Code:      code,
				}
				return nil
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","code":"print('updated')\n"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if captured != (projectRouteSetCodeCall{
		ProjectID: "project-alpha",
		SectionID: "section-1",
		Code:      "print('updated')\n",
	}) {
		t.Fatalf("unexpected setCode call %#v", captured)
	}
}

func TestRegisterProjectRoutesCreatesTopLevelPluginLanguageSection(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Code","implOverrides":{"type":"Code","codeLanguage":"FixtureDSL"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	if !impl.IsCode() || impl.Code == nil {
		t.Fatalf("expected created code section, got %#v", impl)
	}
	if impl.Code.Language != projectstate.CodeLanguage("fixturedsl") {
		t.Fatalf("expected plugin code language fixturedsl, got %q", impl.Code.Language)
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionSeedsWorkflowDefaults(t *testing.T) {
	t.Parallel()

	cases := []struct {
		implType     string
		wantLabel    string
		wantGateType string
	}{
		{
			implType:  "StateMachineStart",
			wantLabel: "Start",
		},
		{
			implType:     "StateMachineGate",
			wantGateType: string(projectstate.StateMachineGateTypeAND),
		},
		{
			implType:  "StateMachineEnd",
			wantLabel: "End",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.implType, func(t *testing.T) {
			t.Parallel()

			projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
				SchemaVersion:    projectstate.CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]projectstate.Project{
					"project-alpha": {
						ID:   "project-alpha",
						Name: "Alpha",
					},
				},
			})
			if err != nil {
				t.Fatalf("open overlay runtime: %v", err)
			}
			t.Cleanup(func() {
				if err := projectRuntime.Close(); err != nil {
					t.Fatalf("close overlay runtime: %v", err)
				}
			})

			handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteCreateTopLevelSection,
				strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","implType":"%s"}`, tc.implType)),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}

			var payload projectstate.CreateTopLevelSectionResult
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode createTopLevelSection response: %v", err)
			}
			if strings.TrimSpace(payload.SectionID) == "" {
				t.Fatalf("expected created section id, got %#v", payload)
			}

			project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
			if err != nil {
				t.Fatalf("project snapshot: %v", err)
			}
			_, _, impl, err := project.ResolveSection(payload.SectionID)
			if err != nil {
				t.Fatalf("resolve created section: %v", err)
			}
			implPayload := decodeProjectRouteRawObject(t, impl.Payload)
			if got, _ := implPayload["type"].(string); got != tc.implType {
				t.Fatalf("expected created type %q, got %#v", tc.implType, implPayload["type"])
			}
			if got, _ := implPayload["machineGroupId"].(string); strings.TrimSpace(got) == "" {
				t.Fatalf("expected created machineGroupId for %s, got %#v", tc.implType, implPayload)
			}
			if tc.wantLabel != "" {
				if got := implPayload["label"]; got != tc.wantLabel {
					t.Fatalf("expected created label %q, got %#v", tc.wantLabel, got)
				}
			}
			if tc.wantGateType != "" {
				if got := implPayload["gateType"]; got != tc.wantGateType {
					t.Fatalf("expected created gateType %q, got %#v", tc.wantGateType, got)
				}
			}
		})
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionAppliesDefaultTaskBoardColumns(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"TaskBoard"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	rawColumns, ok := implPayload["columns"].([]any)
	if !ok || len(rawColumns) != 3 {
		t.Fatalf("expected seeded task board columns, got %#v", implPayload["columns"])
	}
	gotNames := make([]string, 0, len(rawColumns))
	for _, rawColumn := range rawColumns {
		column, ok := rawColumn.(map[string]any)
		if !ok {
			t.Fatalf("expected task board column object, got %#v", rawColumn)
		}
		if got := column["id"]; got == nil || strings.TrimSpace(fmt.Sprintf("%v", got)) == "" {
			t.Fatalf("expected seeded task board column id, got %#v", column)
		}
		gotNames = append(gotNames, fmt.Sprintf("%v", column["name"]))
	}
	if !reflect.DeepEqual(gotNames, []string{"Todo", "Doing", "Done"}) {
		t.Fatalf("expected seeded task board column names, got %#v", gotNames)
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionSupportsIFrame(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"IFrame"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created iframe section: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	if got, _ := implPayload["type"].(string); got != "IFrame" {
		t.Fatalf("expected created type IFrame, got %#v", implPayload["type"])
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionAppliesSnapshotViewportAndName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": mustNormalizedProjectRouteProject(t, projectstate.Project{
				ID:               "project-alpha",
				Name:             "Alpha",
				ActiveViewModeID: "focus",
				TopLevelSectionIDs: []string{
					"existing-section",
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"existing-section": {X: 10, Y: 20, ZIndex: 1},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID: "focus",
						TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
							"existing-section": {X: 10, Y: 20, ZIndex: 1},
						},
						VisibilityBySectionID: map[string]bool{
							"existing-section": true,
						},
					},
				},
				SectionVariantMap: map[string]string{
					"existing-section": "existing-variant",
				},
				Sections: map[string]projectstate.Section{
					"existing-section": {
						ID:               "existing-section",
						Name:             "Existing",
						VariantIDs:       []string{"existing-variant"},
						DefaultVariantID: "existing-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"existing-variant": {
						ID:               "existing-variant",
						ImplID:           "existing-impl",
						NonPresetImplIDs: []string{"existing-impl"},
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"existing-impl": {
						ID:      "existing-impl",
						Kind:    projectstate.SectionKind("textblock"),
						Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "existing-impl", "type": "TextBlock"}),
					},
				},
			}),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Chat","name":"Planning Chat","topLevelSections":{"existing-section":{"x":840,"y":240,"zIndex":9}},"viewportBounds":{"x":760,"y":160,"w":1200,"h":700}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}
	if payload.PanTo != nil {
		t.Fatalf("expected in-viewport placement without pan hint, got %#v", payload.PanTo)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	created, ok := project.Sections[payload.SectionID]
	if !ok {
		t.Fatalf("expected created section in snapshot, got %#v", project.Sections)
	}
	if created.Name != "Planning Chat" {
		t.Fatalf("expected created section name to persist, got %#v", created)
	}

	layout := project.TopLevelSections[payload.SectionID]
	if layout.X <= 400 || layout.Y < 160 {
		t.Fatalf("expected created layout near the live viewport, got %#v", layout)
	}
	existingLayout := project.TopLevelSections["existing-section"]
	if existingLayout.X != 840 || existingLayout.Y != 240 || existingLayout.ZIndex != 9 {
		t.Fatalf("expected snapshot layout update for existing section, got %#v", existingLayout)
	}
	if project.ViewModes["focus"].TopLevelSections["existing-section"].X != 840 || project.ViewModes["focus"].TopLevelSections["existing-section"].Y != 240 {
		t.Fatalf("expected active view mode layout update, got %#v", project.ViewModes["focus"].TopLevelSections["existing-section"])
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionReturnsMetaControlParamIDAndHonorsExplicitPosition(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"MetaControl","controlCodeObjType":"TextParam","position":{"x":-44,"y":91}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}
	if payload.MetaControlParamID == nil || strings.TrimSpace(*payload.MetaControlParamID) == "" {
		t.Fatalf("expected created meta control param id, got %#v", payload)
	}
	if payload.PanTo != nil {
		t.Fatalf("expected explicit-position create to omit pan hint, got %#v", payload.PanTo)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	layout, ok := project.TopLevelSections[payload.SectionID]
	if !ok {
		t.Fatalf("expected created layout in snapshot, got %#v", project.TopLevelSections)
	}
	if layout.X != -44 || layout.Y != 91 {
		t.Fatalf("expected explicit position {-44 91}, got %#v", layout)
	}

	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	if got, _ := implPayload["metaControlParamId"].(string); got != *payload.MetaControlParamID {
		t.Fatalf("expected created meta control payload id %q, got %#v", *payload.MetaControlParamID, implPayload["metaControlParamId"])
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionSupportsFullMetaControlTypeFamily(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	testCases := []struct {
		name         string
		controlType  *string
		expectedType string
	}{
		{name: "default omitted", expectedType: "SliderParam"},
		{name: "code", controlType: stringPointer("CodeParam"), expectedType: "CodeParam"},
		{name: "text", controlType: stringPointer("TextParam"), expectedType: "TextParam"},
		{name: "date", controlType: stringPointer("DateParam"), expectedType: "DateParam"},
		{name: "time", controlType: stringPointer("TimeParam"), expectedType: "TimeParam"},
		{name: "text area", controlType: stringPointer("TextAreaParam"), expectedType: "TextAreaParam"},
		{name: "slider", controlType: stringPointer("SliderParam"), expectedType: "SliderParam"},
		{name: "rotary", controlType: stringPointer("RotaryParam"), expectedType: "RotaryParam"},
		{name: "switch", controlType: stringPointer("SwitchParam"), expectedType: "SwitchParam"},
		{name: "color picker", controlType: stringPointer("ColorPickerParam"), expectedType: "ColorPickerParam"},
		{name: "dropdown", controlType: stringPointer("DropdownParam"), expectedType: "DropdownParam"},
		{name: "password", controlType: stringPointer("PasswordParam"), expectedType: "PasswordParam"},
		{name: "button", controlType: stringPointer("ButtonParam"), expectedType: "ButtonParam"},
		{name: "dropzone", controlType: stringPointer("DropzoneParam"), expectedType: "DropzoneParam"},
	}

	for _, tc := range testCases {
		requestPayload := map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "MetaControl",
		}
		if tc.controlType != nil {
			requestPayload["controlCodeObjType"] = *tc.controlType
		}
		body, err := json.Marshal(requestPayload)
		if err != nil {
			t.Fatalf("marshal %s request: %v", tc.name, err)
		}

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateTopLevelSection,
			strings.NewReader(string(body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s meta control create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		var payload projectstate.CreateTopLevelSectionResult
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode %s createTopLevelSection response: %v", tc.name, err)
		}
		if payload.MetaControlParamID == nil || strings.TrimSpace(*payload.MetaControlParamID) == "" {
			t.Fatalf("expected meta control param id for %s, got %#v", tc.name, payload)
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
		if err != nil {
			t.Fatalf("project snapshot after %s meta control create: %v", tc.name, err)
		}
		codeObjPayload, _, _, _, err := project.ResolveSectionCodeObject(payload.SectionID, *payload.MetaControlParamID)
		if err != nil {
			t.Fatalf("resolve %s meta control code object: %v", tc.name, err)
		}
		if got := payloadStringField(codeObjPayload, "type"); got != tc.expectedType {
			t.Fatalf("expected %s control type %q, got %q", tc.name, tc.expectedType, got)
		}
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionReturns422ForInvalidInitialName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Chat","name":"   "}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection error response: %v", err)
	}
	if payload["detail"] != "Section name cannot be empty." {
		t.Fatalf("expected invalid section-name detail, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	if len(project.Sections) != 0 {
		t.Fatalf("expected invalid createTopLevelSection request to avoid partial state, got %#v", project.Sections)
	}
}

func TestRegisterProjectRoutesCreateTopLevelSectionRemainsIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	assertProjectUnchanged := func(t *testing.T, project projectstate.Project) {
		t.Helper()
		if len(project.Sections) != 0 {
			t.Fatalf("expected no sections after rejected deployment createTopLevelSection, got %#v", project.Sections)
		}
		if len(project.TopLevelSectionIDs) != 0 {
			t.Fatalf("expected no top-level section ids after rejected deployment createTopLevelSection, got %#v", project.TopLevelSectionIDs)
		}
		if len(project.TopLevelSections) != 0 {
			t.Fatalf("expected no top-level layouts after rejected deployment createTopLevelSection, got %#v", project.TopLevelSections)
		}
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, allowRun := range []bool{true, false} {
				t.Run(fmt.Sprintf("allowRun=%t", allowRun), func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": {
									ID:   "project-alpha",
									Name: "Alpha",
								},
							},
						},
						Policy: map[string]any{
							"allowRun": allowRun,
						},
					})
					if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
						t.Fatalf("create deployment session: %v", err)
					}

					handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
					request := httptest.NewRequest(
						http.MethodPost,
						"/api"+RouteCreateTopLevelSection,
						strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Terminal"}`),
					)
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("%s allowRun=%t: expected 403, got %d with body %q", mode, allowRun, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("%s allowRun=%t: expected mode_forbidden response, got %q", mode, allowRun, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
						t.Fatalf("%s allowRun=%t: expected deployment-mode denial detail, got %q", mode, allowRun, response.Body.String())
					}

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					assertProjectUnchanged(t, overlay.Snapshot().Document.Projects["project-alpha"])
					assertProjectUnchanged(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
				})
			}
		})
	}
}

func TestRegisterProjectRoutesFormatCodeInvokesServiceAndReturnsOK(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	var captured projectRouteFormatCodeCall
	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				captured = projectRouteFormatCodeCall{
					ProjectID: projectID,
					SectionID: sectionID,
				}
				return nil
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if captured != (projectRouteFormatCodeCall{
		ProjectID: "project-alpha",
		SectionID: "section-1",
	}) {
		t.Fatalf("unexpected formatCode call %#v", captured)
	}
}

func TestRegisterProjectRoutesFormatCodeIsBlockedInDeploymentModes(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": {
							ID:   "project-alpha",
							Name: "Alpha",
						},
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteFormatCode,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected %s formatCode route to be blocked with 403, got %d with body %q", mode, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
				t.Fatalf("expected mode_forbidden response, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
				t.Fatalf("expected deployment-mode denial detail, got %q", response.Body.String())
			}
		})
	}
}

func TestRegisterProjectRoutesMixedParamPolicyRoutesRemainIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	requestSpecs := []struct {
		name  string
		route string
		body  string
	}{
		{
			name:  "set_code",
			route: RouteSetCode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"code-section","code":"print('blocked')\n"}`,
		},
		{
			name:  "format_code",
			route: RouteFormatCode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"code-section"}`,
		},
		{
			name:  "set_callable",
			route: RouteSetCallable,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","callableName":"sorted","refetchParams":false}`,
		},
		{
			name:  "set_gen_code_prefix",
			route: RouteSetGenCodePrefix,
			body:  `{"projectConfigId":"project-alpha","genCodePrefix":"import math\n"}`,
		},
		{
			name:  "set_gen_code_suffix",
			route: RouteSetGenCodeSuffix,
			body:  `{"projectConfigId":"project-alpha","genCodeSuffix":"state = CustomState()\n"}`,
		},
		{
			name:  "append_draw_area_layer_item",
			route: RouteAppendDrawAreaLayerItem,
			body:  `{"projectConfigId":"project-alpha","sectionId":"draw-section","layerIdx":0,"element":{"type":"BrushStroke","dataPath":"artifacts/new-stroke.json","transformId":"artifacts/new-transform.json"}}`,
		},
		{
			name:  "set_image_area_image_path",
			route: RouteSetImageAreaImagePath,
			body:  `{"projectConfigId":"project-alpha","sectionId":"image-section","imagePath":"image.png"}`,
		},
		{
			name:  "set_chart_area_data_path",
			route: RouteSetChartAreaDataPath,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","dataPath":"artifacts/chart.csv"}`,
		},
		{
			name:  "set_chart_type",
			route: RouteSetChartType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartType":"scatter"}`,
		},
		{
			name:  "set_chart_settings",
			route: RouteSetChartSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chart-section","chartSettings":{"type":"scatter","categoryColumn":"series"},"changedSettings":["categoryColumn"]}`,
		},
		{
			name:  "add_kwarg",
			route: RouteAddKwarg,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section"}`,
		},
		{
			name:  "delete_kwarg",
			route: RouteDeleteKwarg,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section"}`,
		},
		{
			name:  "get_password_param_value",
			route: RouteGetPasswordParamValue,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramInfoId":"password-param"}`,
		},
	}

	projectSnapshotJSON := func(t *testing.T, project projectstate.Project) string {
		t.Helper()

		raw, err := json.Marshal(project)
		if err != nil {
			t.Fatalf("marshal project snapshot: %v", err)
		}
		return string(raw)
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, allowParamChanges := range []bool{false, true} {
				t.Run(fmt.Sprintf("allow_param_changes=%t", allowParamChanges), func(t *testing.T) {
					for _, requestSpec := range requestSpecs {
						t.Run(requestSpec.name, func(t *testing.T) {
							deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
								Mode: mode,
								Document: projectstate.Document{
									SchemaVersion:    projectstate.CurrentSchemaVersion,
									DefaultProjectID: "project-alpha",
									Projects: map[string]projectstate.Project{
										"project-alpha": {
											ID:   "project-alpha",
											Name: "Alpha",
										},
									},
								},
								Policy: map[string]any{
									"allowParamChanges": allowParamChanges,
								},
							})
							if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
								t.Fatalf("create deployment session: %v", err)
							}

							overlay, err := deploymentRuntime.Overlay("share-a")
							if err != nil {
								t.Fatalf("deployment overlay: %v", err)
							}
							beforeOverlay := projectSnapshotJSON(t, overlay.Snapshot().Document.Projects["project-alpha"])
							beforeBase := projectSnapshotJSON(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])

							handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
							request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
							request.Header.Set("Content-Type", "application/json")
							request.Header.Set(modes.ShareSessionHeaderName, "share-a")
							response := httptest.NewRecorder()
							handler.ServeHTTP(response, request)
							if response.Code != http.StatusForbidden {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected 403, got %d with body %q",
									mode,
									allowParamChanges,
									requestSpec.route,
									response.Code,
									response.Body.String(),
								)
							}
							if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected mode_forbidden response, got %q",
									mode,
									allowParamChanges,
									requestSpec.route,
									response.Body.String(),
								)
							}
							if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected deployment-mode denial detail, got %q",
									mode,
									allowParamChanges,
									requestSpec.route,
									response.Body.String(),
								)
							}

							afterOverlay := projectSnapshotJSON(t, overlay.Snapshot().Document.Projects["project-alpha"])
							if afterOverlay != beforeOverlay {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected rejected request to leave overlay unchanged, got before=%s after=%s",
									mode,
									allowParamChanges,
									requestSpec.route,
									beforeOverlay,
									afterOverlay,
								)
							}
							afterBase := projectSnapshotJSON(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
							if afterBase != beforeBase {
								t.Fatalf(
									"%s allowParamChanges=%t %s: expected rejected request to leave base unchanged, got before=%s after=%s",
									mode,
									allowParamChanges,
									requestSpec.route,
									beforeBase,
									afterBase,
								)
							}
						})
					}
				})
			}
		})
	}
}
