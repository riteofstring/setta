package httpapi

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type projectParamDeploymentBlockedRouteSpec struct {
	name  string
	route string
	body  string
}

func projectParamDeploymentBlockedRouteSpecs() []projectParamDeploymentBlockedRouteSpec {
	return []projectParamDeploymentBlockedRouteSpec{
		{
			name:  "get_password_param_value",
			route: RouteGetPasswordParamValue,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`,
		},
		{
			name:  "change_param_impl",
			route: RouteChangeParamImpl,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","selectedId":"PasswordParam"}`,
		},
		{
			name:  "update_param_impl_config",
			route: RouteUpdateParamImplConfig,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","newConfig":{"description":"blocked"}}`,
		},
		{
			name:  "add_kwarg",
			route: RouteAddKwarg,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`,
		},
		{
			name:  "delete_kwarg",
			route: RouteDeleteKwarg,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`,
		},
	}
}

func assertProjectParamRouteBlockedInDeploymentMode(
	t *testing.T,
	mode config.Mode,
	requestSpec projectParamDeploymentBlockedRouteSpec,
) {
	t.Helper()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode: mode,
		Document: projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": passwordParamRouteTestProject(t),
			},
		},
		Policy: map[string]any{
			"allowParamChanges": true,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create deployment session: %v", err)
	}

	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	assertProjectParamDeploymentRouteForbidden(t, mode, response, requestSpec.route)

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	assertProjectParamRoutesPreserved(t, overlay.Snapshot().Document.Projects["project-alpha"])
	assertProjectParamRoutesPreserved(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
}

func assertProjectParamDeploymentRouteForbidden(
	t *testing.T,
	mode config.Mode,
	response *httptest.ResponseRecorder,
	route string,
) {
	t.Helper()

	if response.Code != http.StatusForbidden {
		t.Fatalf("%s %s: expected 403, got %d with body %q", mode, route, response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("%s %s: expected mode_forbidden response, got %q", mode, route, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
		t.Fatalf("%s %s: expected deployment-mode denial detail, got %q", mode, route, response.Body.String())
	}
}

func assertProjectParamRoutesPreserved(t *testing.T, project projectstate.Project) {
	t.Helper()

	sharedRootPayload, _, _, sharedRootImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
	if err != nil {
		t.Fatalf("resolve shared-root: %v", err)
	}
	if sharedRootImpl.Type != "NestedParam" {
		t.Fatalf("expected shared-root impl NestedParam, got %q", sharedRootImpl.Type)
	}
	if children := decodeProjectRouteStringArray(sharedRootPayload["children"]); !reflect.DeepEqual(children, []string{"shared-child", "shared-secret"}) {
		t.Fatalf("expected shared-root children [shared-child shared-secret], got %#v", children)
	}

	assertProjectParamRouteCodeObjVariantMapPreserved(t, project)
	assertProjectParamRouteSharedChildPreserved(t, project)
	assertProjectParamRouteSharedSecretPreserved(t, project)
}

func assertProjectParamRouteCodeObjVariantMapPreserved(t *testing.T, project projectstate.Project) {
	t.Helper()

	dictVariantID := project.SectionVariantMap["dict-a"]
	dictPayload, err := project.EffectiveSectionPayload("dict-a", dictVariantID)
	if err != nil {
		t.Fatalf("effective section payload dict-a: %v", err)
	}
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if len(codeObjVariantMap) != 3 {
		t.Fatalf("expected dict codeObjVariantMap to keep 3 entries, got %#v", codeObjVariantMap)
	}
	for _, codeObjID := range []string{"shared-root", "shared-child", "shared-secret"} {
		if _, ok := codeObjVariantMap[codeObjID]; !ok {
			t.Fatalf("expected dict codeObjVariantMap to preserve %q, got %#v", codeObjID, codeObjVariantMap)
		}
	}
}

func assertProjectParamRouteSharedChildPreserved(t *testing.T, project projectstate.Project) {
	t.Helper()

	sharedChildPayload, _, _, sharedChildImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve shared-child: %v", err)
	}
	if sharedChildImpl.Type != "TextParam" {
		t.Fatalf("expected shared-child impl TextParam, got %q", sharedChildImpl.Type)
	}
	if got, _ := sharedChildPayload["value"].(string); got != "seed" {
		t.Fatalf("expected shared-child value seed, got %#v", sharedChildPayload["value"])
	}
	if _, ok := sharedChildPayload["description"]; ok {
		t.Fatalf("expected rejected deployment mutations to leave shared-child description unset, got %#v", sharedChildPayload)
	}
}

func assertProjectParamRouteSharedSecretPreserved(t *testing.T, project projectstate.Project) {
	t.Helper()

	sharedSecretPayload, _, _, sharedSecretImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-secret")
	if err != nil {
		t.Fatalf("resolve shared-secret: %v", err)
	}
	if sharedSecretImpl.Type != "PasswordParam" {
		t.Fatalf("expected shared-secret impl PasswordParam, got %q", sharedSecretImpl.Type)
	}
	if got, _ := sharedSecretPayload["value"].(string); got != "" {
		t.Fatalf("expected shared-secret value to stay redacted, got %#v", sharedSecretPayload["value"])
	}
	if _, ok := sharedSecretPayload["hasSecret"]; ok {
		t.Fatalf("expected rejected deployment mutations to avoid adding hasSecret state, got %#v", sharedSecretPayload)
	}
}
