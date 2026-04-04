package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/launcher"
	"setta/internal/modes"
)

const RouteGetLauncherStatus = "/launcherStatus"
const RouteSetupLauncher = "/setupLauncher"
const RouteRepairLauncher = "/repairLauncher"
const RouteRemoveLauncher = "/removeLauncher"
const RouteUpdateLauncher = "/updateLauncher"

type LauncherManagementRouteDependencies struct {
	ModePolicy       modes.Policy
	DefaultSettaHome string
	Manager          *launcher.ManagementService
}

type LauncherOperationErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type LauncherStatusResponse struct {
	Ok                       bool                                `json:"ok"`
	Installed                *bool                               `json:"installed,omitempty"`
	SettaHome                *string                             `json:"settaHome,omitempty"`
	LauncherDir              *string                             `json:"launcherDir,omitempty"`
	MetadataPath             *string                             `json:"metadataPath,omitempty"`
	TargetCommand            []string                            `json:"targetCommand,omitempty"`
	TargetValid              *bool                               `json:"targetValid,omitempty"`
	TargetError              *string                             `json:"targetError,omitempty"`
	Channel                  *string                             `json:"channel,omitempty"`
	SettaVersion             *string                             `json:"settaVersion,omitempty"`
	OpenMode                 *launcher.LauncherOpenMode          `json:"openMode,omitempty"`
	WorkspaceBehavior        *launcher.LauncherWorkspaceBehavior `json:"workspaceBehavior,omitempty"`
	LastUsedWorkspace        *string                             `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions          map[string]string                   `json:"artifactOptions,omitempty"`
	ManagedArtifacts         map[string]string                   `json:"managedArtifacts,omitempty"`
	ExistingManagedArtifacts []string                            `json:"existingManagedArtifacts,omitempty"`
	MissingManagedArtifacts  []string                            `json:"missingManagedArtifacts,omitempty"`
	UpdateCapability         *launcher.LauncherUpdateCapability  `json:"updateCapability,omitempty"`
	UpdateGuidance           *string                             `json:"updateGuidance,omitempty"`
	Error                    *LauncherOperationErrorPayload      `json:"error,omitempty"`
}

type LauncherUpdateResponse struct {
	Ok                       bool                                `json:"ok"`
	Installed                *bool                               `json:"installed,omitempty"`
	SettaHome                *string                             `json:"settaHome,omitempty"`
	LauncherDir              *string                             `json:"launcherDir,omitempty"`
	MetadataPath             *string                             `json:"metadataPath,omitempty"`
	TargetCommand            []string                            `json:"targetCommand,omitempty"`
	TargetValid              *bool                               `json:"targetValid,omitempty"`
	TargetError              *string                             `json:"targetError,omitempty"`
	Channel                  *string                             `json:"channel,omitempty"`
	SettaVersion             *string                             `json:"settaVersion,omitempty"`
	OpenMode                 *launcher.LauncherOpenMode          `json:"openMode,omitempty"`
	WorkspaceBehavior        *launcher.LauncherWorkspaceBehavior `json:"workspaceBehavior,omitempty"`
	LastUsedWorkspace        *string                             `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions          map[string]string                   `json:"artifactOptions,omitempty"`
	ManagedArtifacts         map[string]string                   `json:"managedArtifacts,omitempty"`
	ExistingManagedArtifacts []string                            `json:"existingManagedArtifacts,omitempty"`
	MissingManagedArtifacts  []string                            `json:"missingManagedArtifacts,omitempty"`
	UpdateCapability         *launcher.LauncherUpdateCapability  `json:"updateCapability,omitempty"`
	UpdateGuidance           *string                             `json:"updateGuidance,omitempty"`
	Error                    *LauncherOperationErrorPayload      `json:"error,omitempty"`
	PackageSpec              *string                             `json:"packageSpec,omitempty"`
	FromVersion              *string                             `json:"fromVersion,omitempty"`
	ToVersion                *string                             `json:"toVersion,omitempty"`
}

type LauncherRequestBase struct {
	SettaHome *string `json:"settaHome"`
}

type setupLauncherRequest struct {
	SettaHome         *string            `json:"settaHome"`
	Channel           *string            `json:"channel"`
	InstallSource     *string            `json:"installSource"`
	OpenMode          *string            `json:"openMode"`
	WorkspaceBehavior *string            `json:"workspaceBehavior"`
	InstallArtifacts  *bool              `json:"installArtifacts"`
	ArtifactOptions   *map[string]string `json:"artifactOptions"`
}

type UpdateLauncherRequest struct {
	SettaHome   *string `json:"settaHome"`
	PackageSpec *string `json:"packageSpec"`
}

func RegisterLauncherManagementRoutes(router chi.Router, deps LauncherManagementRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if !deps.ModePolicy.IsIDE() {
		return nil
	}
	if strings.TrimSpace(deps.DefaultSettaHome) == "" {
		return fmt.Errorf("default setta home is required in ide mode")
	}
	if deps.Manager == nil {
		return fmt.Errorf("launcher management service is required in ide mode")
	}

	router.Get(RouteGetLauncherStatus, getLauncherStatusHandler(deps.DefaultSettaHome, deps.Manager))
	router.Post(RouteSetupLauncher, setupLauncherHandler(deps.DefaultSettaHome, deps.Manager))
	router.Post(RouteRepairLauncher, repairLauncherHandler(deps.DefaultSettaHome, deps.Manager))
	router.Post(RouteRemoveLauncher, removeLauncherHandler(deps.DefaultSettaHome, deps.Manager))
	router.Post(RouteUpdateLauncher, updateLauncherHandler(deps.DefaultSettaHome, deps.Manager))
	return nil
}

func getLauncherStatusHandler(defaultSettaHome string, manager *launcher.ManagementService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, r.URL.Query().Get("setta_home"))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		status, err := manager.CollectStatus(settaHome)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherStatusResponseFromSnapshot(status))
	}
}

func setupLauncherHandler(defaultSettaHome string, manager *launcher.ManagementService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeStrictJSONBody[setupLauncherRequest](r)
		if err != nil {
			var unknownFieldErr *strictJSONUnknownFieldError
			if errors.As(err, &unknownFieldErr) {
				writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", unknownFieldErr.Error())
				return
			}
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, stringPointerValue(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		input, err := normalizeSetupLauncherInput(payload)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}

		if _, err := manager.Setup(settaHome, input); err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}
		status, err := manager.CollectStatus(settaHome)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherStatusResponseFromSnapshot(status))
	}
}

func repairLauncherHandler(defaultSettaHome string, manager *launcher.ManagementService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LauncherRequestBase](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, stringPointerValue(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		status, err := manager.Repair(settaHome)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherStatusResponseFromSnapshot(status))
	}
}

func removeLauncherHandler(defaultSettaHome string, manager *launcher.ManagementService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[LauncherRequestBase](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, stringPointerValue(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if _, err := manager.Remove(settaHome); err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}
		status, err := manager.CollectStatus(settaHome)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherStatusErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherStatusResponseFromSnapshot(status))
	}
}

func updateLauncherHandler(defaultSettaHome string, manager *launcher.ManagementService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateLauncherRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		settaHome, err := launcher.ResolveScopedSettaHome(defaultSettaHome, stringPointerValue(payload.SettaHome))
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		packageSpec := "setta"
		if payload.PackageSpec != nil {
			packageSpec = *payload.PackageSpec
		}
		result, err := manager.Update(settaHome, packageSpec)
		if err != nil {
			writeJSON(w, http.StatusOK, launcherUpdateErrorResponse(err))
			return
		}
		writeJSON(w, http.StatusOK, launcherUpdateResponseFromResult(result))
	}
}

func normalizeSetupLauncherInput(payload setupLauncherRequest) (launcher.LauncherSetupInput, error) {
	installSource, err := normalizeLauncherInstallSourceForSetup(payload.InstallSource)
	if err != nil {
		return launcher.LauncherSetupInput{}, err
	}
	openMode, err := normalizeLauncherOpenModeForSetup(payload.OpenMode)
	if err != nil {
		return launcher.LauncherSetupInput{}, err
	}
	workspaceBehavior, err := normalizeLauncherWorkspaceBehaviorForSetup(payload.WorkspaceBehavior)
	if err != nil {
		return launcher.LauncherSetupInput{}, err
	}
	return launcher.LauncherSetupInput{
		Channel:           payload.Channel,
		InstallSource:     installSource,
		OpenMode:          openMode,
		WorkspaceBehavior: workspaceBehavior,
		InstallArtifacts:  payload.InstallArtifacts,
		ArtifactOptions:   payload.ArtifactOptions,
	}, nil
}

func normalizeLauncherInstallSourceForSetup(value *string) (*launcher.LauncherInstallSource, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	switch trimmed {
	case string(launcher.LauncherInstallSourceUVTool):
		normalized := launcher.LauncherInstallSourceUVTool
		return &normalized, nil
	case string(launcher.LauncherInstallSourceInstallerManaged):
		normalized := launcher.LauncherInstallSourceInstallerManaged
		return &normalized, nil
	case string(launcher.LauncherInstallSourceUnsupported):
		normalized := launcher.LauncherInstallSourceUnsupported
		return &normalized, nil
	default:
		return nil, &launcher.LauncherSetupError{
			Code: "BadRequest",
			Message: fmt.Sprintf(
				"installSource must be one of %q, %q, or %q.",
				launcher.LauncherInstallSourceUVTool,
				launcher.LauncherInstallSourceInstallerManaged,
				launcher.LauncherInstallSourceUnsupported,
			),
		}
	}
}

func normalizeLauncherOpenModeForSetup(value *string) (*launcher.LauncherOpenMode, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	switch trimmed {
	case "browser":
		normalized := launcher.LauncherOpenModeBrowser
		return &normalized, nil
	case "chrome-app":
		normalized := launcher.LauncherOpenModeChromeApp
		return &normalized, nil
	default:
		return nil, &launcher.LauncherSetupError{
			Code:    "BadRequest",
			Message: "openMode must be either 'browser' or 'chrome-app'.",
		}
	}
}

func normalizeLauncherWorkspaceBehaviorForSetup(value *string) (*launcher.LauncherWorkspaceBehavior, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	switch trimmed {
	case string(launcher.LauncherWorkspaceBehaviorLastUsedOrPrompt):
		normalized := launcher.LauncherWorkspaceBehaviorLastUsedOrPrompt
		return &normalized, nil
	case string(launcher.LauncherWorkspaceBehaviorAlwaysPrompt):
		normalized := launcher.LauncherWorkspaceBehaviorAlwaysPrompt
		return &normalized, nil
	default:
		return nil, &launcher.LauncherSetupError{
			Code: "BadRequest",
			Message: fmt.Sprintf(
				"workspaceBehavior must be either %q or %q.",
				launcher.LauncherWorkspaceBehaviorLastUsedOrPrompt,
				launcher.LauncherWorkspaceBehaviorAlwaysPrompt,
			),
		}
	}
}

func launcherStatusResponseFromSnapshot(status launcher.LauncherStatusSnapshot) LauncherStatusResponse {
	response := LauncherStatusResponse{
		Ok:                       true,
		Installed:                boolPointer(status.Installed),
		SettaHome:                stringPointer(status.SettaHome),
		LauncherDir:              stringPointer(status.LauncherDir),
		MetadataPath:             stringPointer(status.MetadataPath),
		TargetCommand:            append([]string(nil), status.TargetCommand...),
		TargetValid:              status.TargetValid,
		TargetError:              cloneStringPointer(status.TargetError),
		Channel:                  cloneStringPointer(status.Channel),
		SettaVersion:             cloneStringPointer(status.SettaVersion),
		LastUsedWorkspace:        cloneStringPointer(status.LastUsedWorkspace),
		ArtifactOptions:          cloneStringMap(status.ArtifactOptions),
		ManagedArtifacts:         cloneStringMap(status.ManagedArtifacts),
		ExistingManagedArtifacts: append([]string(nil), status.ExistingManagedArtifacts...),
		MissingManagedArtifacts:  append([]string(nil), status.MissingManagedArtifacts...),
		UpdateGuidance:           cloneStringPointer(status.UpdateGuidance),
	}
	if status.OpenMode != nil {
		value := *status.OpenMode
		response.OpenMode = &value
	}
	if status.WorkspaceBehavior != nil {
		value := *status.WorkspaceBehavior
		response.WorkspaceBehavior = &value
	}
	if status.UpdateCapability != "" {
		updateCapability := status.UpdateCapability
		response.UpdateCapability = &updateCapability
	}
	return response
}

func launcherUpdateResponseFromResult(result launcher.LauncherUpdateResult) LauncherUpdateResponse {
	statusResponse := launcherStatusResponseFromSnapshot(result.Status)
	response := LauncherUpdateResponse{
		Ok:                       statusResponse.Ok,
		Installed:                statusResponse.Installed,
		SettaHome:                statusResponse.SettaHome,
		LauncherDir:              statusResponse.LauncherDir,
		MetadataPath:             statusResponse.MetadataPath,
		TargetCommand:            statusResponse.TargetCommand,
		TargetValid:              statusResponse.TargetValid,
		TargetError:              statusResponse.TargetError,
		Channel:                  statusResponse.Channel,
		SettaVersion:             statusResponse.SettaVersion,
		OpenMode:                 statusResponse.OpenMode,
		WorkspaceBehavior:        statusResponse.WorkspaceBehavior,
		LastUsedWorkspace:        statusResponse.LastUsedWorkspace,
		ArtifactOptions:          statusResponse.ArtifactOptions,
		ManagedArtifacts:         statusResponse.ManagedArtifacts,
		ExistingManagedArtifacts: statusResponse.ExistingManagedArtifacts,
		MissingManagedArtifacts:  statusResponse.MissingManagedArtifacts,
		UpdateCapability:         statusResponse.UpdateCapability,
		UpdateGuidance:           statusResponse.UpdateGuidance,
		PackageSpec:              stringPointer(result.PackageSpec),
		FromVersion:              cloneStringPointer(result.FromVersion),
		ToVersion:                cloneStringPointer(result.ToVersion),
	}
	return response
}

func launcherStatusErrorResponse(err error) LauncherStatusResponse {
	code, message := launcherManagementErrorDetails(err)
	return LauncherStatusResponse{
		Ok:    false,
		Error: &LauncherOperationErrorPayload{Code: code, Message: message},
	}
}

func launcherUpdateErrorResponse(err error) LauncherUpdateResponse {
	code, message := launcherManagementErrorDetails(err)
	return LauncherUpdateResponse{
		Ok:    false,
		Error: &LauncherOperationErrorPayload{Code: code, Message: message},
	}
}

func launcherManagementErrorDetails(err error) (string, string) {
	var setupErr *launcher.LauncherSetupError
	if errors.As(err, &setupErr) {
		return setupErr.Code, setupErr.Message
	}
	return "InternalError", "Internal Server Error"
}

func decodeStrictJSONBody[T any](r *http.Request) (T, error) {
	var payload T
	if r.Body == nil {
		return payload, nil
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return payload, err
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return payload, nil
	}
	if field, ok := detectUnknownTopLevelJSONField[T](body); ok {
		return payload, &strictJSONUnknownFieldError{Field: field}
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		if errors.Is(err, io.EOF) {
			return payload, nil
		}
		return payload, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return payload, fmt.Errorf("unexpected trailing JSON content")
		}
		return payload, err
	}
	return payload, nil
}

type strictJSONUnknownFieldError struct {
	Field string
}

func (e *strictJSONUnknownFieldError) Error() string {
	if e == nil || strings.TrimSpace(e.Field) == "" {
		return "Unknown field."
	}
	return fmt.Sprintf("Unknown field: %s.", e.Field)
}

func detectUnknownTopLevelJSONField[T any](body []byte) (string, bool) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return "", false
	}

	fields := strictJSONFieldNames[T]()
	if len(fields) == 0 {
		return "", false
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &raw); err != nil {
		return "", false
	}
	for key := range raw {
		if _, ok := fields[key]; ok {
			continue
		}
		return key, true
	}
	return "", false
}

func strictJSONFieldNames[T any]() map[string]struct{} {
	var zero T
	valueType := reflect.TypeOf(zero)
	for valueType != nil && valueType.Kind() == reflect.Pointer {
		valueType = valueType.Elem()
	}
	if valueType == nil || valueType.Kind() != reflect.Struct {
		return nil
	}

	fields := make(map[string]struct{}, valueType.NumField())
	for i := 0; i < valueType.NumField(); i++ {
		field := valueType.Field(i)
		if !field.IsExported() {
			continue
		}
		tag := field.Tag.Get("json")
		name := strings.TrimSpace(strings.Split(tag, ",")[0])
		switch name {
		case "":
			name = field.Name
		case "-":
			continue
		}
		fields[name] = struct{}{}
	}
	return fields
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func stringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	cloned := value
	return &cloned
}

func boolPointer(value bool) *bool {
	return &value
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneStringMap(value map[string]string) map[string]string {
	if value == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(value))
	for key, entry := range value {
		cloned[key] = entry
	}
	return cloned
}
