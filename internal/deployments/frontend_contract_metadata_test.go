package deployments

import (
	"reflect"
	"slices"
	"testing"
)

func TestFrontendValueRunSnapshotModeUIConfigUsesCanonicalModeMetadata(t *testing.T) {
	t.Parallel()

	got := FrontendValueRunSnapshotModeUIConfig()
	wantOptions := []RunSnapshotModeOption{
		{
			Value:       RunSnapshotModeEphemeral,
			Label:       "Ephemeral",
			Description: "Snapshot per run, cleaned up automatically.",
		},
		{
			Value:       RunSnapshotModeAlways,
			Label:       "Always",
			Description: "Snapshot per run, stored under code history.",
		},
		{
			Value:       RunSnapshotModeNever,
			Label:       "Never",
			Description: "Run from canonical files without a snapshot.",
		},
	}
	if !reflect.DeepEqual(got.Options, wantOptions) {
		t.Fatalf("unexpected run snapshot mode options: got %#v want %#v", got.Options, wantOptions)
	}
	if !reflect.DeepEqual(
		got.DeploymentOptions,
		frontendRunSnapshotModeOptionsFor(RunSnapshotModeEphemeral, RunSnapshotModeAlways),
	) {
		t.Fatalf("unexpected deployment run snapshot mode options: got %#v", got.DeploymentOptions)
	}

	got.Options[0].Label = "mutated"
	got.DeploymentOptions[0].Description = "mutated"

	gotAgain := FrontendValueRunSnapshotModeUIConfig()
	if gotAgain.Options[0].Label != "Ephemeral" {
		t.Fatalf("expected options to be cloned, got %#v", gotAgain.Options)
	}
	if gotAgain.DeploymentOptions[0].Description != "Snapshot per run, cleaned up automatically." {
		t.Fatalf("expected deployment options to be cloned, got %#v", gotAgain.DeploymentOptions)
	}
	if !slices.Equal(
		[]RunSnapshotMode{
			gotAgain.DeploymentOptions[0].Value,
			gotAgain.DeploymentOptions[1].Value,
		},
		[]RunSnapshotMode{RunSnapshotModeEphemeral, RunSnapshotModeAlways},
	) {
		t.Fatalf("unexpected deployment mode order: got %#v", gotAgain.DeploymentOptions)
	}
}
