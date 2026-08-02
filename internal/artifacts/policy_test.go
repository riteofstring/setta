package artifacts

import "testing"

func TestEnforceUploadPolicyRejectsOversize(t *testing.T) {
	t.Parallel()

	err := EnforceUploadPolicy(UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes: 1,
			MaxFileLabel: "1 B",
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 B",
		},
	}, UploadScopeChat, "file.bin", "application/octet-stream", 2)
	if err == nil {
		t.Fatal("expected oversized payload rejection")
	}
	assertArtifactErrorKind(t, err, ErrorTooLarge)
}

func TestEnforceUploadPolicyRejectsDisallowedMime(t *testing.T) {
	t.Parallel()

	err := EnforceUploadPolicy(UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes:        5,
			MaxFileLabel:        "5 B",
			AllowedMimePrefixes: []string{"image/"},
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 B",
		},
	}, UploadScopeChat, "notes.txt", "text/plain", 1)
	if err == nil {
		t.Fatal("expected disallowed mime rejection")
	}
	assertArtifactErrorKind(t, err, ErrorMimeNotAllowed)
}

func TestEnforceUploadPolicyUsesExplicitPoliciesArgument(t *testing.T) {
	t.Parallel()

	defaultPolicies := DefaultUploadPolicies()
	if err := EnforceUploadPolicy(defaultPolicies, UploadScopeChat, "notes.txt", "text/plain", 1); err != nil {
		t.Fatalf("expected default policies to allow small text attachment, got %v", err)
	}

	explicitPolicies := UploadPolicies{
		Chat: ScopeUploadPolicy{
			MaxFileBytes:        1,
			MaxFileLabel:        "1 B",
			AllowedMimePrefixes: []string{"image/"},
		},
		Generic: ScopeUploadPolicy{
			MaxFileBytes: 10,
			MaxFileLabel: "10 B",
		},
	}

	if err := EnforceUploadPolicy(explicitPolicies, UploadScopeChat, "photo.png", "image/png", 2); err == nil {
		t.Fatal("expected explicit size override rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorTooLarge)
	}

	if err := EnforceUploadPolicy(explicitPolicies, UploadScopeChat, "notes.txt", "text/plain", 1); err == nil {
		t.Fatal("expected explicit mime override rejection")
	} else {
		assertArtifactErrorKind(t, err, ErrorMimeNotAllowed)
	}
}
