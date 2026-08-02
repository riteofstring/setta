package artifacts

import (
	"fmt"
	"strings"
)

const (
	DefaultMaxChatFileBytes    = 25 * 1024 * 1024
	DefaultMaxGenericFileBytes = 25 * 1024 * 1024
)

type ScopeUploadPolicy struct {
	MaxFileBytes        int
	MaxFileLabel        string
	AllowedMimePrefixes []string
}

type UploadPolicies struct {
	Chat    ScopeUploadPolicy
	Generic ScopeUploadPolicy
}

func DefaultUploadPolicies() UploadPolicies {
	return UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: DefaultMaxChatFileBytes,
			MaxFileLabel: "25 MB",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: DefaultMaxGenericFileBytes,
			MaxFileLabel: "25 MB",
		},
	}
}

func cloneUploadPolicies(policies *UploadPolicies) UploadPolicies {
	if policies == nil {
		return DefaultUploadPolicies()
	}
	return UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes:        policies.Chat.MaxFileBytes,
			MaxFileLabel:        policies.Chat.MaxFileLabel,
			AllowedMimePrefixes: append([]string(nil), policies.Chat.AllowedMimePrefixes...),
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes:        policies.Generic.MaxFileBytes,
			MaxFileLabel:        policies.Generic.MaxFileLabel,
			AllowedMimePrefixes: append([]string(nil), policies.Generic.AllowedMimePrefixes...),
		},
	}
}

func resolveUploadPolicy(policies UploadPolicies, scope UploadScope) (ScopeUploadPolicy, error) {
	switch scope {
	case UploadScopeChat:
		return policies.Chat, nil
	case UploadScopeGeneric:
		return policies.Generic, nil
	default:
		return ScopeUploadPolicy{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Invalid upload scope: %q", scope),
		}
	}
}

func EnforceUploadPolicy(policies UploadPolicies, scope UploadScope, label string, mimeType string, byteLength int) error {
	policy, err := resolveUploadPolicy(policies, scope)
	if err != nil {
		return err
	}
	if byteLength > policy.MaxFileBytes {
		return &Error{
			Kind:    ErrorTooLarge,
			Message: fmt.Sprintf("File exceeds %s limit: %s", policy.MaxFileLabel, label),
		}
	}
	if !isMimeAllowed(strings.TrimSpace(mimeType), policy.AllowedMimePrefixes) {
		return &Error{
			Kind:    ErrorMimeNotAllowed,
			Message: fmt.Sprintf("Attachment type %s is not allowed for %s. Allowed prefixes: %s.", mimeType, label, strings.Join(policy.AllowedMimePrefixes, ", ")),
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
