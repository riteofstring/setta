package watchcodecontracts

import (
	"net/http"
	"strings"
)

const (
	BackendContractVersion   = 1
	BackendDataSchemaVersion = 1

	BackendRouteBasePath     = "/watch-code"
	BackendRouteSuffixInputs = "inputs"

	BackendLocalSettingIDFolders = "folders"
	BackendLocalSettingIDFiles   = "files"

	BackendReadHandlerIDFolders = "read_folders"
	BackendReadHandlerIDFiles   = "read_files"

	BackendWriteHandlerIDFolders = "write_folders"
	BackendWriteHandlerIDFiles   = "write_files"

	BackendErrorInvalidJSON             = "invalid_json"
	BackendErrorInvalidRequest          = "invalid_request"
	BackendErrorInternal                = "internal_error"
	BackendErrorMethodNotAllowed        = "method_not_allowed"
	BackendErrorNotFound                = "not_found"
	BackendErrorProjectConfigIDRequired = "project_config_id_required"
	BackendErrorProjectConfigNotFound   = "project_config_not_found"
	BackendErrorInvalidWatchCodeInput   = "invalid_watch_code_input"
	BackendErrorProviderRequired        = "watch_code_provider_required"
)

var backendErrorHTTPStatusByCode = map[string]int{
	BackendErrorInvalidJSON:             http.StatusBadRequest,
	BackendErrorInvalidRequest:          http.StatusBadRequest,
	BackendErrorInternal:                http.StatusInternalServerError,
	BackendErrorMethodNotAllowed:        http.StatusMethodNotAllowed,
	BackendErrorNotFound:                http.StatusNotFound,
	BackendErrorProjectConfigIDRequired: http.StatusBadRequest,
	BackendErrorProjectConfigNotFound:   http.StatusNotFound,
	BackendErrorInvalidWatchCodeInput:   http.StatusBadRequest,
	BackendErrorProviderRequired:        http.StatusConflict,
}

type BackendUISettingContract struct {
	LocalSettingID string
	ReadHandlerID  string
	WriteHandlerID string
}

func BackendRouteSuffixes() []string {
	return []string{
		BackendRouteSuffixInputs,
	}
}

func BackendErrorHTTPStatusByCode() map[string]int {
	result := make(map[string]int, len(backendErrorHTTPStatusByCode))
	for code, status := range backendErrorHTTPStatusByCode {
		result[code] = status
	}
	return result
}

func BackendErrorHTTPStatus(code string) int {
	status, ok := backendErrorHTTPStatusByCode[strings.TrimSpace(code)]
	if !ok {
		return http.StatusInternalServerError
	}
	return status
}

func BackendLocalSettingIDs() []string {
	settings := BackendUISettings()
	result := make([]string, 0, len(settings))
	for _, setting := range settings {
		result = append(result, setting.LocalSettingID)
	}
	return result
}

func BackendUISettings() []BackendUISettingContract {
	return []BackendUISettingContract{
		{
			LocalSettingID: BackendLocalSettingIDFolders,
			ReadHandlerID:  BackendReadHandlerIDFolders,
			WriteHandlerID: BackendWriteHandlerIDFolders,
		},
		{
			LocalSettingID: BackendLocalSettingIDFiles,
			ReadHandlerID:  BackendReadHandlerIDFiles,
			WriteHandlerID: BackendWriteHandlerIDFiles,
		},
	}
}

func BackendReadHandlerByLocalSettingID() map[string]string {
	settings := BackendUISettings()
	result := make(map[string]string, len(settings))
	for _, setting := range settings {
		result[setting.LocalSettingID] = setting.ReadHandlerID
	}
	return result
}

func BackendWriteHandlerByLocalSettingID() map[string]string {
	settings := BackendUISettings()
	result := make(map[string]string, len(settings))
	for _, setting := range settings {
		result[setting.LocalSettingID] = setting.WriteHandlerID
	}
	return result
}

func BackendRoutePath(pluginID string, suffix string) string {
	return "/plugins/" + strings.TrimSpace(pluginID) + BackendRouteBasePath + "/" + strings.TrimSpace(suffix)
}

func ParseBackendRoutePath(path string) (string, string, bool) {
	rest, ok := strings.CutPrefix(strings.TrimSpace(path), "/plugins/")
	if !ok {
		return "", "", false
	}
	pluginID, routePath, ok := strings.Cut(rest, "/")
	if !ok || strings.TrimSpace(pluginID) == "" || strings.TrimSpace(pluginID) != pluginID {
		return "", "", false
	}
	suffix, ok := strings.CutPrefix("/"+routePath, BackendRouteBasePath+"/")
	if !ok || !IsBackendRouteSuffix(suffix) {
		return "", "", false
	}
	return pluginID, suffix, true
}

func IsBackendRouteSuffix(suffix string) bool {
	for _, value := range BackendRouteSuffixes() {
		if value == suffix {
			return true
		}
	}
	return false
}

func IsBackendLocalSettingID(localSettingID string) bool {
	return containsBackendUISettingValue(localSettingID, func(setting BackendUISettingContract) string {
		return setting.LocalSettingID
	})
}

func IsBackendReadHandlerID(handlerID string) bool {
	return containsBackendUISettingValue(handlerID, func(setting BackendUISettingContract) string {
		return setting.ReadHandlerID
	})
}

func IsBackendWriteHandlerID(handlerID string) bool {
	return containsBackendUISettingValue(handlerID, func(setting BackendUISettingContract) string {
		return setting.WriteHandlerID
	})
}

func IsBackendUISettingHandlerID(handlerID string) bool {
	return IsBackendReadHandlerID(handlerID) || IsBackendWriteHandlerID(handlerID)
}

func containsBackendUISettingValue(expected string, value func(BackendUISettingContract) string) bool {
	trimmedExpected := strings.TrimSpace(expected)
	for _, setting := range BackendUISettings() {
		if value(setting) == trimmedExpected {
			return true
		}
	}
	return false
}
