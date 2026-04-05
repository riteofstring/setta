package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/agentprofiles"
	"setta/internal/deployments"
	"setta/internal/detachedruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/gitread"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/transcriptionprofiles"
)

func TestBindingTypeNameUsesOwnerNamesByDefault(t *testing.T) {
	t.Parallel()

	cases := []struct {
		typ  reflect.Type
		want string
	}{
		{typ: reflect.TypeOf(prompttemplates.Template{}), want: "Template"},
		{typ: reflect.TypeOf(gitread.StatusResponse{}), want: "StatusResponse"},
		{typ: reflect.TypeOf(projectstate.ProjectConfigMetadata{}), want: "ProjectConfigMetadata"},
		{typ: reflect.TypeOf(deployments.Policy{}), want: "Policy"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.want, func(t *testing.T) {
			t.Parallel()
			if got := BindingTypeName(tc.typ); got != tc.want {
				t.Fatalf("BindingTypeName(%v) = %q, want %q", tc.typ, got, tc.want)
			}
		})
	}
}

func TestBindingTypeNamePrefixesOnlyTrueCollisions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		typ  reflect.Type
		want string
	}{
		{typ: reflect.TypeOf(agentprofiles.Profile{}), want: "AgentProfile"},
		{typ: reflect.TypeOf(transcriptionprofiles.Profile{}), want: "TranscriptionProfile"},
		{typ: reflect.TypeOf(llmconfig.Config{}), want: "LLMConfig"},
		{typ: reflect.TypeOf(externalagentconfigs.Config{}), want: "ExternalAgentConfig"},
		{typ: reflect.TypeOf(detachedruns.Run{}), want: "DetachedRun"},
		{typ: reflect.TypeOf(detachedruns.Status("")), want: "DetachedStatus"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.want, func(t *testing.T) {
			t.Parallel()
			if got := BindingTypeName(tc.typ); got != tc.want {
				t.Fatalf("BindingTypeName(%v) = %q, want %q", tc.typ, got, tc.want)
			}
		})
	}
}

func TestBindingTypeNamesStayUniqueAcrossGeneratedRoots(t *testing.T) {
	t.Parallel()

	seen := map[string]reflect.Type{}
	for typ, name := range frontendBindingGeneratedTypeNamesByType {
		if prior, ok := seen[name]; ok && prior != typ {
			t.Fatalf("duplicate binding name %q for %v and %v", name, prior, typ)
		}
		seen[name] = typ
	}
}
