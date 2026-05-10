package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg           = "--setta-plugin-backend-probe"
	backendRuntimeArg         = "--setta-plugin-backend-runtime"
	backendRuntimeKindCodegen = "codegen_target"
	pluginFixturePythonEnv    = "SETTA_PLUGIN_FIXTURE_PYTHON"
	pluginFixtureLSPScriptEnv = "SETTA_PLUGIN_FIXTURE_LSP_SCRIPT"
	pluginFixtureRuntimePaths = "SETTA_PLUGIN_FIXTURE_RUNTIME_SEARCH_PATHS_KEY"
	pluginFixtureLanguageName = "setta-fixture-backend:fixturedsl"
	pluginFixtureLanguageID   = "fixturedsl"
	pluginFixtureSettingsKey  = "fixtureDslLanguageServer"
)

type backendRequestContext struct {
	ServerMode      string `json:"serverMode"`
	HasAuth         bool   `json:"hasAuth"`
	SessionID       string `json:"sessionId,omitempty"`
	ShareSessionID  string `json:"shareSessionId,omitempty"`
	ProjectConfigID string `json:"projectConfigId,omitempty"`
	WorkspaceRoot   string `json:"workspaceRoot,omitempty"`
	SettaFilesRoot  string `json:"settaFilesRoot,omitempty"`
	RuntimeRoot     string `json:"runtimeRoot,omitempty"`
}

type backendRuntimeRequest struct {
	SchemaVersion int                     `json:"schemaVersion"`
	Kind          string                  `json:"kind"`
	HTTP          *backendHTTPRequest     `json:"http,omitempty"`
	Listener      *backendListenerRequest `json:"listenerEndpoint,omitempty"`
	Codegen       *backendCodegenRequest  `json:"codegenTarget,omitempty"`
}

type backendHTTPRequest struct {
	Context    backendRequestContext `json:"context"`
	Method     string                `json:"method"`
	Path       string                `json:"path"`
	RawQuery   string                `json:"rawQuery,omitempty"`
	Headers    map[string][]string   `json:"headers"`
	BodyBase64 string                `json:"bodyBase64,omitempty"`
}

type backendListenerRequest struct {
	Context      backendRequestContext `json:"context"`
	EndpointName string                `json:"endpointName"`
	Payload      map[string]any        `json:"payload"`
}

type backendCodegenRequest struct {
	Language      string         `json:"language"`
	TargetID      string         `json:"targetId"`
	ProjectState  map[string]any `json:"projectState"`
	TargetOptions map[string]any `json:"targetOptions"`
}

type backendRuntimeResponse struct {
	SchemaVersion int                      `json:"schemaVersion"`
	HTTP          *backendHTTPResponse     `json:"http,omitempty"`
	Listener      *backendListenerResponse `json:"listenerEndpoint,omitempty"`
	Codegen       *backendCodegenResponse  `json:"codegenTarget,omitempty"`
}

type backendHTTPResponse struct {
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	BodyBase64 string              `json:"bodyBase64,omitempty"`
}

type backendListenerResponse struct {
	Result any                  `json:"result"`
	Error  *backendRuntimeError `json:"error,omitempty"`
}

type backendCodegenResponse struct {
	Files []backendCodegenFile `json:"files"`
}

type backendCodegenFile struct {
	RelativePath string `json:"relativePath,omitempty"`
	Content      string `json:"content"`
}

type backendRuntimeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func main() {
	if len(os.Args) != 2 {
		return
	}

	switch os.Args[1] {
	case backendProbeArg:
		languageServers := []map[string]any{}
		if registration, ok := resolveLanguageServerRegistration(); ok {
			languageServers = append(languageServers, registration)
		}
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"codegenTargets": []map[string]any{
				{
					"targetId":        "typescript",
					"language":        "setta-fixture-backend-codegen:typescript",
					"name":            "Fixture TypeScript State",
					"defaultFileName": "fixture_state.ts",
				},
			},
			"languageServers": languageServers,
			"watchCodeBackend": map[string]any{
				"contractVersion":        1,
				"dataSchemaVersion":      1,
				"languages":              []string{"python"},
				"requiresLanguageServer": true,
			},
			"routes": []map[string]any{
				{
					"path":    "/health",
					"methods": []string{"GET"},
				},
				{
					"path":    "/items",
					"methods": []string{"POST", "DELETE"},
				},
			},
			"staticDirs": []map[string]any{
				{
					"routePrefix": "/static",
					"dir":         "backend/static",
				},
			},
			"listenerEndpoints": []map[string]any{
				{
					"name": "route_backend_fixture_ping",
				},
			},
		})
	case backendRuntimeArg:
		handleRuntime()
	}
}

func resolveLanguageServerRegistration() (map[string]any, bool) {
	command := strings.TrimSpace(os.Getenv(pluginFixturePythonEnv))
	switch {
	case command != "":
		resolved, err := resolveCommand(command)
		if err != nil {
			return nil, false
		}
		command = resolved
	default:
		for _, candidate := range []string{"python3", "python"} {
			resolved, err := exec.LookPath(candidate)
			if err == nil {
				command = resolved
				break
			}
		}
	}
	if command == "" {
		return nil, false
	}

	scriptPath := strings.TrimSpace(os.Getenv(pluginFixtureLSPScriptEnv))
	if scriptPath == "" {
		return nil, false
	}
	absoluteScriptPath, err := filepath.Abs(scriptPath)
	if err != nil {
		return nil, false
	}

	registration := map[string]any{
		"name":        pluginFixtureLanguageName,
		"language":    pluginFixtureLanguageID,
		"command":     command,
		"args":        []string{absoluteScriptPath},
		"settingsKey": pluginFixtureSettingsKey,
	}
	if runtimeSearchPathsKey := strings.TrimSpace(os.Getenv(pluginFixtureRuntimePaths)); runtimeSearchPathsKey != "" {
		registration["runtimeSearchPathsKey"] = runtimeSearchPathsKey
	}
	return registration, true
}

func resolveCommand(command string) (string, error) {
	if strings.ContainsRune(command, filepath.Separator) {
		return filepath.Abs(command)
	}
	return exec.LookPath(command)
}

func handleRuntime() {
	var request backendRuntimeRequest
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		fail("decode backend runtime request: %v", err)
	}

	switch strings.TrimSpace(request.Kind) {
	case "http":
		if request.HTTP == nil {
			fail("http runtime payload is required")
		}
		handleHTTP(*request.HTTP)
	case "listener_endpoint":
		if request.Listener == nil {
			fail("listener runtime payload is required")
		}
		handleListener(*request.Listener)
	case backendRuntimeKindCodegen:
		if request.Codegen == nil {
			fail("codegen runtime payload is required")
		}
		handleCodegen(*request.Codegen)
	default:
		fail("unsupported backend runtime kind %q", request.Kind)
	}
}

func handleHTTP(request backendHTTPRequest) {
	switch {
	case request.Method == http.MethodGet && request.Path == "/health":
		writeJSON(backendRuntimeResponse{
			SchemaVersion: 1,
			HTTP: &backendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
				BodyBase64: encodeBody(map[string]any{
					"ok":             true,
					"serverMode":     request.Context.ServerMode,
					"hasAuth":        request.Context.HasAuth,
					"sessionId":      request.Context.SessionID,
					"shareSessionId": request.Context.ShareSessionID,
				}),
			},
		})
	case request.Method == http.MethodPost && request.Path == "/items":
		bodyPayload := map[string]any{}
		bodyBytes, err := decodeBody(request.BodyBase64)
		if err != nil {
			fail("decode backend runtime body: %v", err)
		}
		if len(bodyBytes) != 0 {
			if err := json.Unmarshal(bodyBytes, &bodyPayload); err != nil {
				fail("decode backend runtime json body: %v", err)
			}
		}
		writeJSON(backendRuntimeResponse{
			SchemaVersion: 1,
			HTTP: &backendHTTPResponse{
				StatusCode: http.StatusCreated,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
					"X-Plugin":     {"backend-fixture"},
				},
				BodyBase64: encodeBody(map[string]any{
					"method":         request.Method,
					"path":           request.Path,
					"rawQuery":       request.RawQuery,
					"body":           bodyPayload,
					"contentType":    firstHeaderValue(request.Headers, "Content-Type"),
					"serverMode":     request.Context.ServerMode,
					"hasAuth":        request.Context.HasAuth,
					"sessionId":      request.Context.SessionID,
					"shareSessionId": request.Context.ShareSessionID,
				}),
			},
		})
	case request.Method == http.MethodDelete && request.Path == "/items":
		writeJSON(backendRuntimeResponse{
			SchemaVersion: 1,
			HTTP: &backendHTTPResponse{
				StatusCode: http.StatusNoContent,
				Headers:    map[string][]string{},
			},
		})
	default:
		writeJSON(backendRuntimeResponse{
			SchemaVersion: 1,
			HTTP: &backendHTTPResponse{
				StatusCode: http.StatusNotFound,
				Headers:    map[string][]string{},
			},
		})
	}
}

func handleListener(request backendListenerRequest) {
	if strings.TrimSpace(request.EndpointName) != "route_backend_fixture_ping" {
		writeJSON(backendRuntimeResponse{
			SchemaVersion: 1,
			Listener: &backendListenerResponse{
				Error: &backendRuntimeError{
					Code:    "UNKNOWN_ENDPOINT",
					Message: "unknown listener endpoint",
				},
			},
		})
		return
	}

	if request.Payload == nil {
		request.Payload = map[string]any{}
	}
	writeJSON(backendRuntimeResponse{
		SchemaVersion: 1,
		Listener: &backendListenerResponse{
			Result: map[string]any{
				"endpointName":    request.EndpointName,
				"projectConfigId": request.Context.ProjectConfigID,
				"sessionId":       request.Context.SessionID,
				"hasAuth":         request.Context.HasAuth,
				"payload":         request.Payload,
			},
		},
	})
}

func handleCodegen(request backendCodegenRequest) {
	projectName, ok := request.ProjectState["name"].(string)
	if !ok || strings.TrimSpace(projectName) == "" {
		fail("projectState.name missing in codegen runtime payload")
	}

	className := "SettaState"
	if rawClassName, ok := request.TargetOptions["className"].(string); ok && strings.TrimSpace(rawClassName) != "" {
		className = strings.TrimSpace(rawClassName)
	}

	file := backendCodegenFile{
		Content: "export class " + className + " {\n" +
			"  readonly projectName = " + fmt.Sprintf("%q", projectName) + ";\n" +
			"}\n",
	}
	if rawOutputPath, ok := request.TargetOptions["outputPath"].(string); ok && strings.TrimSpace(rawOutputPath) != "" {
		file.RelativePath = rawOutputPath
	}

	writeJSON(backendRuntimeResponse{
		SchemaVersion: 1,
		Codegen: &backendCodegenResponse{
			Files: []backendCodegenFile{file},
		},
	})
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode json payload: %v", err)
	}
}

func encodeBody(payload any) string {
	body, err := json.Marshal(payload)
	if err != nil {
		fail("encode body payload: %v", err)
	}
	return base64.StdEncoding.EncodeToString(body)
}

func decodeBody(bodyBase64 string) ([]byte, error) {
	trimmed := strings.TrimSpace(bodyBase64)
	if trimmed == "" {
		return []byte{}, nil
	}
	return base64.StdEncoding.DecodeString(trimmed)
}

func firstHeaderValue(headers map[string][]string, headerName string) string {
	for key, values := range headers {
		if !strings.EqualFold(strings.TrimSpace(key), strings.TrimSpace(headerName)) {
			continue
		}
		if len(values) == 0 {
			return ""
		}
		return values[0]
	}
	return ""
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
