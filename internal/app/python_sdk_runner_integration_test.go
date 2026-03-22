package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"testing"

	"setta/internal/config"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppRetainedPythonRunnerSummaryUsesLiveGoServerContracts(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("SETTA_SESSIONS_ROOT", filepath.Join(cfg.Paths.RuntimeRoot, "sessions"))

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunnerSummaryProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	repoRoot := appTestRepoRoot(t)
	pythonPath := appTestWorkerPython(t, repoRoot)
	script := `
import json
import sys
from pathlib import Path

from setta.api.runner import SettaRunner

runner = SettaRunner(
    project_name="Alpha",
    base_url=sys.argv[1],
    workspace_root=Path(sys.argv[2]),
)
summary = runner.summary()
learning_rate = summary.params.by_name("Training Settings", "Learning Rate")
payload = {
    "training_section_id": str(summary.section("Training Settings").id),
    "variant_ids": [
        str(variant_id)
        for variant_id in summary.section("Training Settings").variants.by_name(
            ["Baseline", "High Accuracy"]
        )
    ],
    "learning_rate_param": {
        "sectionId": str(learning_rate.sectionId),
        "codeObjId": str(learning_rate.codeObjId),
    },
}
print(json.dumps(payload))
`
	command := exec.CommandContext(
		t.Context(),
		pythonPath,
		"-c",
		script,
		server.URL,
		cfg.Paths.WorkspaceRoot,
	)
	command.Dir = cfg.Paths.WorkspaceRoot
	command.Env = append(command.Environ(), "PYTHONPATH="+filepath.Join(repoRoot, "backend"))
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run retained python runner integration script: %v\n%s", err, string(output))
	}

	var payload struct {
		TrainingSectionID string   `json:"training_section_id"`
		VariantIDs        []string `json:"variant_ids"`
		LearningRateParam struct {
			SectionID string `json:"sectionId"`
			CodeObjID string `json:"codeObjId"`
		} `json:"learning_rate_param"`
	}
	if err := json.Unmarshal(output, &payload); err != nil {
		t.Fatalf("decode retained python runner payload: %v\n%s", err, string(output))
	}

	if payload.TrainingSectionID != "training-section" {
		t.Fatalf("expected training-section, got %#v", payload.TrainingSectionID)
	}
	if len(payload.VariantIDs) != 2 || payload.VariantIDs[0] != "training-variant-base" || payload.VariantIDs[1] != "training-variant-accurate" {
		t.Fatalf("unexpected variant ids %#v", payload.VariantIDs)
	}
	if payload.LearningRateParam.SectionID != "training-section" || payload.LearningRateParam.CodeObjID != "learning-rate" {
		t.Fatalf("unexpected learning rate param payload %#v", payload.LearningRateParam)
	}
}

func seedAppRunnerSummaryProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"notes-section":    "notes-variant",
				"training-section": "training-variant-base",
			},
			Sections: map[string]projectstate.Section{
				"training-section": {
					ID:               "training-section",
					Name:             "Training",
					DisplayName:      "Training Settings",
					VariantIDs:       []string{"training-variant-base", "training-variant-accurate"},
					DefaultVariantID: "training-variant-base",
				},
				"notes-section": {
					ID:               "notes-section",
					Name:             "Notes",
					DisplayName:      "Overview Notes",
					VariantIDs:       []string{"notes-variant"},
					DefaultVariantID: "notes-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"training-variant-base": {
					ID:     "training-variant-base",
					Name:   "Baseline",
					ImplID: "training-impl",
				},
				"training-variant-accurate": {
					ID:     "training-variant-accurate",
					Name:   "High Accuracy",
					ImplID: "training-impl",
				},
				"notes-variant": {
					ID:     "notes-variant",
					Name:   "Notes Variant",
					ImplID: "notes-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"training-impl": {
					ID:      "training-impl",
					Kind:    projectstate.SectionKind("dict"),
					Payload: projectstate.RawJSON(`{"id":"training-impl","type":"Dict","codeObjVariantMap":{"learning-rate":"learning-rate-variant","training-root":"training-root-variant"}}`),
				},
				"notes-impl": {
					ID:      "notes-impl",
					Kind:    projectstate.SectionKind("text_block"),
					Payload: projectstate.RawJSON(`{"id":"notes-impl","type":"TextBlock","text":"Notes"}`),
				},
			},
			CodeObjs: map[string]projectstate.CodeObject{
				"training-root": {
					ID:               "training-root",
					Name:             "training_root",
					DisplayName:      "Training Root",
					VariantIDs:       []string{"training-root-variant"},
					DefaultVariantID: "training-root-variant",
				},
				"learning-rate": {
					ID:               "learning-rate",
					Name:             "learning_rate",
					DisplayName:      "Learning Rate",
					VariantIDs:       []string{"learning-rate-variant"},
					DefaultVariantID: "learning-rate-variant",
				},
			},
			CodeObjVariants: map[string]projectstate.CodeObjectVariant{
				"training-root-variant": {
					ID:     "training-root-variant",
					ImplID: "training-root-impl",
				},
				"learning-rate-variant": {
					ID:     "learning-rate-variant",
					ImplID: "learning-rate-impl",
				},
			},
			CodeObjImpls: map[string]projectstate.CodeObjectImpl{
				"training-root-impl": {
					ID:      "training-root-impl",
					Type:    "NestedParam",
					Payload: projectstate.RawJSON(`{"id":"training-root-impl","type":"NestedParam","children":["learning-rate"]}`),
				},
				"learning-rate-impl": {
					ID:      "learning-rate-impl",
					Type:    "TextParam",
					Payload: projectstate.RawJSON(`{"id":"learning-rate-impl","type":"TextParam","value":"0.001"}`),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed runner summary project: %v", err)
	}
}
