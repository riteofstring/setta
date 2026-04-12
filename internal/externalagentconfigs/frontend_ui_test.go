package externalagentconfigs

import (
	"reflect"
	"slices"
	"testing"
)

func TestFrontendValueExternalAgentUIConfigUsesCanonicalClaudeMetadata(t *testing.T) {
	t.Parallel()

	got := FrontendValueExternalAgentUIConfig()

	if !slices.Equal(got.DefaultClaudeAskRules, DefaultClaudeAskRules()) {
		t.Fatalf("unexpected default ask rules: got %v want %v", got.DefaultClaudeAskRules, DefaultClaudeAskRules())
	}
	if !slices.Equal(got.DefaultClaudeSettingsSources, DefaultClaudeSettingsSources()) {
		t.Fatalf("unexpected default settings sources: got %v want %v", got.DefaultClaudeSettingsSources, DefaultClaudeSettingsSources())
	}
	if want := []ExternalAgentApprovalPolicyOption{
		{Value: "", Label: "Use settings file / chat override"},
		{Value: ClaudeApprovalPolicyDefault, Label: "Default"},
		{Value: ClaudeApprovalPolicyAcceptEdits, Label: "Accept edits"},
		{Value: ClaudeApprovalPolicyPlan, Label: "Plan"},
		{Value: ClaudeApprovalPolicyBypassPermissions, Label: "YOLO (bypassPermissions)"},
	}; !reflect.DeepEqual(got.ClaudeApprovalPolicyOptions, want) {
		t.Fatalf("unexpected approval policy options: got %#v want %#v", got.ClaudeApprovalPolicyOptions, want)
	}

	got.DefaultClaudeAskRules[0] = "mutated"
	got.DefaultClaudeSettingsSources[0] = ClaudeSettingsSourceUser
	got.ClaudeApprovalPolicyOptions[1].Label = "mutated"

	gotAgain := FrontendValueExternalAgentUIConfig()
	if gotAgain.DefaultClaudeAskRules[0] != defaultClaudeAskRules[0] {
		t.Fatalf("expected default ask rules to be cloned, got %v", gotAgain.DefaultClaudeAskRules)
	}
	if gotAgain.DefaultClaudeSettingsSources[0] != defaultClaudeSettingsSources[0] {
		t.Fatalf("expected default settings sources to be cloned, got %v", gotAgain.DefaultClaudeSettingsSources)
	}
	if gotAgain.ClaudeApprovalPolicyOptions[1].Label != "Default" {
		t.Fatalf("expected approval policy options to be cloned, got %#v", gotAgain.ClaudeApprovalPolicyOptions)
	}
}

func TestNormalizeClaudeApprovalPolicy(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name   string
		input  string
		expect string
	}{
		{name: "empty", input: "", expect: ""},
		{name: "canonical default", input: ClaudeApprovalPolicyDefault, expect: ClaudeApprovalPolicyDefault},
		{name: "canonical accept edits", input: ClaudeApprovalPolicyAcceptEdits, expect: ClaudeApprovalPolicyAcceptEdits},
		{name: "canonical plan", input: ClaudeApprovalPolicyPlan, expect: ClaudeApprovalPolicyPlan},
		{name: "canonical bypass", input: ClaudeApprovalPolicyBypassPermissions, expect: ClaudeApprovalPolicyBypassPermissions},
		{name: "allow alias", input: "allow", expect: ClaudeApprovalPolicyBypassPermissions},
		{name: "auto alias", input: "auto", expect: ClaudeApprovalPolicyBypassPermissions},
		{name: "bypass alias", input: "bypass", expect: ClaudeApprovalPolicyBypassPermissions},
		{name: "ask alias", input: "ask", expect: ClaudeApprovalPolicyDefault},
		{name: "deny alias", input: "deny", expect: ClaudeApprovalPolicyDefault},
		{name: "block alias", input: "block", expect: ClaudeApprovalPolicyDefault},
		{name: "invalid", input: "unsupported", expect: ""},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if got := NormalizeClaudeApprovalPolicy(testCase.input); got != testCase.expect {
				t.Fatalf("NormalizeClaudeApprovalPolicy(%q) = %q, want %q", testCase.input, got, testCase.expect)
			}
		})
	}
}
