package plugins

import "fmt"

type ServiceErrorCode string

const (
	ServiceErrorCodeConfigSchemaInvalid     ServiceErrorCode = "PLUGIN_CONFIG_SCHEMA_INVALID"
	ServiceErrorCodeInstallerUnavailable    ServiceErrorCode = "PLUGIN_INSTALLER_BACKEND_UNAVAILABLE"
	ServiceErrorCodeManagedExternally       ServiceErrorCode = "PLUGIN_MANAGED_EXTERNALLY"
	ServiceErrorCodeHostVersionInvalid      ServiceErrorCode = "PLUGIN_HOST_VERSION_INVALID"
	ServiceErrorCodeInitInvalidID           ServiceErrorCode = "PLUGIN_INIT_INVALID_ID"
	ServiceErrorCodeInitTargetExists        ServiceErrorCode = "PLUGIN_INIT_TARGET_EXISTS"
	ServiceErrorCodeInstallFailed           ServiceErrorCode = "PLUGIN_INSTALL_FAILED"
	ServiceErrorCodeLinkFailed              ServiceErrorCode = "PLUGIN_LINK_FAILED"
	ServiceErrorCodeLockfileEntryMissing    ServiceErrorCode = "PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE"
	ServiceErrorCodeLockfileInvalid         ServiceErrorCode = "PLUGIN_LOCKFILE_INVALID"
	ServiceErrorCodeLockfileNotFound        ServiceErrorCode = "PLUGIN_LOCKFILE_NOT_FOUND"
	ServiceErrorCodeManifestDuplicateCap    ServiceErrorCode = "PLUGIN_MANIFEST_DUPLICATE_CAPABILITY"
	ServiceErrorCodeManifestInvalid         ServiceErrorCode = "PLUGIN_MANIFEST_INVALID"
	ServiceErrorCodeManifestInvalidCap      ServiceErrorCode = "PLUGIN_MANIFEST_INVALID_CAPABILITY"
	ServiceErrorCodeManifestPathNotFound    ServiceErrorCode = "PLUGIN_MANIFEST_PATH_NOT_FOUND"
	ServiceErrorCodeManifestUnsupported     ServiceErrorCode = "PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA"
	ServiceErrorCodeManifestVersionMismatch ServiceErrorCode = "PLUGIN_MANIFEST_VERSION_INCOMPATIBLE"
	ServiceErrorCodeNotFound                ServiceErrorCode = "PLUGIN_NOT_FOUND"
	ServiceErrorCodeRollbackUnavailable     ServiceErrorCode = "PLUGIN_ROLLBACK_UNAVAILABLE"
	ServiceErrorCodeScopeInvalid            ServiceErrorCode = "PLUGIN_SCOPE_INVALID"
	ServiceErrorCodeSourceArchiveTraversal  ServiceErrorCode = "PLUGIN_SOURCE_ARCHIVE_TRAVERSAL"
	ServiceErrorCodeSourceAmbiguousRoot     ServiceErrorCode = "PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT"
	ServiceErrorCodeSourceFetchFailed       ServiceErrorCode = "PLUGIN_SOURCE_FETCH_FAILED"
	ServiceErrorCodeSourceIdentityMismatch  ServiceErrorCode = "PLUGIN_SOURCE_IDENTITY_MISMATCH"
	ServiceErrorCodeSourceInvalid           ServiceErrorCode = "PLUGIN_SOURCE_INVALID"
	ServiceErrorCodeSourceManifestNotFound  ServiceErrorCode = "PLUGIN_SOURCE_MANIFEST_NOT_FOUND"
	ServiceErrorCodeSourceNotFound          ServiceErrorCode = "PLUGIN_SOURCE_NOT_FOUND"
	ServiceErrorCodeSourceSchemeUnsupported ServiceErrorCode = "PLUGIN_SOURCE_SCHEME_UNSUPPORTED"
	ServiceErrorCodeSourceVersionMismatch   ServiceErrorCode = "PLUGIN_SOURCE_VERSION_MISMATCH"
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
