package settajsonrenderappgenbackend

import (
	"slices"
	"testing"

	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestFrontendValueAppSpecPatchPolicyConfigUsesAuthoritativeAppSpecPatchPolicy(t *testing.T) {
	t.Parallel()

	got := FrontendValueAppSpecPatchPolicyConfig()
	want := appspec.DefaultPatchPolicy()

	if got.CommentPrefix != want.CommentPrefix {
		t.Fatalf("unexpected patch comment prefix: got %q want %q", got.CommentPrefix, want.CommentPrefix)
	}
	if got.RootPath != want.RootPath {
		t.Fatalf("unexpected patch root path: got %q want %q", got.RootPath, want.RootPath)
	}
	if got.ElementsPathPrefix != want.ElementsPathPrefix {
		t.Fatalf("unexpected patch elements path prefix: got %q want %q", got.ElementsPathPrefix, want.ElementsPathPrefix)
	}
	if got.RootResetValue != want.RootResetValue {
		t.Fatalf("unexpected patch root reset value: got %q want %q", got.RootResetValue, want.RootResetValue)
	}
	if !slices.Equal(got.AllowedOps, want.AllowedOps) {
		t.Fatalf("unexpected allowed patch ops: got %v want %v", got.AllowedOps, want.AllowedOps)
	}
	if !slices.Equal(got.ValueOptionalOps, want.ValueOptionalOps) {
		t.Fatalf("unexpected optional-value patch ops: got %v want %v", got.ValueOptionalOps, want.ValueOptionalOps)
	}
}
