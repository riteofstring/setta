package artifacts

import (
	"fmt"
	"strings"
)

const (
	defaultMaxChatFileBytes    = 25 * 1024 * 1024
	defaultMaxGenericFileBytes = 25 * 1024 * 1024
)

type uploadPolicy struct {
	scope               UploadScope
	maxFileBytes        int
	maxFileLabel        string
	allowedMimePrefixes []string
}

func resolveUploadPolicy(scope UploadScope) (uploadPolicy, error) {
	switch scope {
	case UploadScopeChat:
		return uploadPolicy{
			scope:        scope,
			maxFileBytes: defaultMaxChatFileBytes,
			maxFileLabel: "25 MB",
		}, nil
	case UploadScopeGeneric:
		return uploadPolicy{
			scope:        scope,
			maxFileBytes: defaultMaxGenericFileBytes,
			maxFileLabel: "25 MB",
		}, nil
	default:
		return uploadPolicy{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Invalid upload scope: %q", scope),
		}
	}
}

func enforceUploadPolicy(scope UploadScope, label string, mimeType string, byteLength int) error {
	policy, err := resolveUploadPolicy(scope)
	if err != nil {
		return err
	}
	if byteLength > policy.maxFileBytes {
		return &Error{
			Kind:    ErrorTooLarge,
			Message: fmt.Sprintf("File exceeds %s limit: %s", policy.maxFileLabel, label),
		}
	}
	if !isMimeAllowed(strings.TrimSpace(mimeType), policy.allowedMimePrefixes) {
		return &Error{
			Kind:    ErrorMimeNotAllowed,
			Message: fmt.Sprintf("Attachment type %s is not allowed for %s. Allowed prefixes: %s.", mimeType, label, strings.Join(policy.allowedMimePrefixes, ", ")),
		}
	}
	return nil
}

func isMimeAllowed(mimeType string, prefixes []string) bool {
	if len(prefixes) == 0 {
		return true
	}
	for _, prefix := range prefixes {
		if strings.HasPrefix(mimeType, prefix) {
			return true
		}
	}
	return false
}
