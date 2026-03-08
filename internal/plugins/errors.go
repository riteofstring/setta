package plugins

import "fmt"

type ServiceErrorCode string

const (
	ServiceErrorCodeManagedExternally       ServiceErrorCode = "PLUGIN_MANAGED_EXTERNALLY"
	ServiceErrorCodeNotFound                ServiceErrorCode = "PLUGIN_NOT_FOUND"
	ServiceErrorCodeRollbackUnavailable     ServiceErrorCode = "PLUGIN_ROLLBACK_UNAVAILABLE"
	ServiceErrorCodeScopeInvalid            ServiceErrorCode = "PLUGIN_SCOPE_INVALID"
	ServiceErrorCodeSourceFetchFailed       ServiceErrorCode = "PLUGIN_SOURCE_FETCH_FAILED"
	ServiceErrorCodeSourceInvalid           ServiceErrorCode = "PLUGIN_SOURCE_INVALID"
	ServiceErrorCodeSourceSchemeUnsupported ServiceErrorCode = "PLUGIN_SOURCE_SCHEME_UNSUPPORTED"
	ServiceErrorCodeTargetExists            ServiceErrorCode = "PLUGIN_TARGET_EXISTS"
	ServiceErrorCodeTargetTraversal         ServiceErrorCode = "PLUGIN_TARGET_PATH_TRAVERSAL"
	ServiceErrorCodeUninstallScopeRequired  ServiceErrorCode = "PLUGIN_UNINSTALL_SCOPE_REQUIRED"
	ServiceErrorCodeUpdateUnavailable       ServiceErrorCode = "PLUGIN_UPDATE_UNAVAILABLE"
)

type ServiceError struct {
	Code    ServiceErrorCode
	Message string
}

func (e *ServiceError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func newServiceError(code ServiceErrorCode, format string, args ...any) error {
	return &ServiceError{
		Code:    code,
		Message: fmt.Sprintf(format, args...),
	}
}
