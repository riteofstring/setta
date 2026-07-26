package artifactdoc

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestLiveCodexComposesStaticProfileDocument(t *testing.T) {
	if os.Getenv("SETTA_LIVE_CODEX") != "1" {
		t.Skip("set SETTA_LIVE_CODEX=1 to run the ChatGPT-authenticated OpenUI output-quality check")
	}
	if _, err := exec.LookPath("codex"); err != nil {
		t.Skip("Codex CLI is unavailable")
	}

	runtime := agent.NewRuntime(agent.Config{
		ExcludedEnv: []string{"OPENAI_API_KEY"},
		Version:     "openui-static-profile-live-test",
	})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		if err := runtime.Shutdown(ctx); err != nil {
			t.Errorf("shutdown live Codex runtime: %v", err)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	const model = "gpt-5.6-sol"
	models, err := runtime.ListModels(ctx, nil, agent.MaxThreadPageSize, true)
	if err != nil {
		if liveArtifactDocAuthUnavailable(err) {
			t.Skipf("ChatGPT authentication is unavailable: %v", err)
		}
		t.Fatalf("list live Codex models: %v", err)
	}
	if !artifactDocModelPageContains(models, model) {
		t.Fatalf("live model catalog does not contain required artifact model %s", model)
	}

	catalog := SettaCatalogV1()
	instructions := catalog.GenerationInstructions()
	input, err := json.Marshal(map[string]string{
		"request": `Create a concise mixed support-delivery review titled "Support delivery review" from only these facts:
- Resolved tickets: 412; Escalated tickets: 17.
- Weekly resolved counts: W1=118, W2=137, W3=157.
- Team table rows: Platform=142, Desktop=131, Runtime=139.
The document must include Heading, Text, Metric, Table, BarChart, Markdown, CodeBlock, and FileReference.
The Markdown must link to https://example.com/support.
The code block must show ./scripts/go.sh test ./internal/conversation/artifactdoc.
The file reference must be docs/plans/openui-artifact-system-plan.md.`,
	})
	if err != nil {
		t.Fatalf("encode live artifact request: %v", err)
	}
	outputSchema := json.RawMessage(`{
  "type": "object",
  "properties": {
    "title": {"type": "string"},
    "source": {"type": "string"}
  },
  "required": ["title", "source"],
  "additionalProperties": false
}`)
	result, err := runtime.RunFreshStructuredCall(ctx, agent.FreshStructuredCallRequest{
		ID:            "openui-static-profile-output-quality",
		WorkspaceRoot: t.TempDir(),
		Invocation: agent.Invocation{
			Model:           model,
			ReasoningEffort: "high",
			PermissionMode:  agent.PermissionModeReadOnly,
			ApprovalMode:    agent.ApprovalModeNever,
		},
		DeveloperInstructions: instructions,
		Input:                 input,
		OutputSchema:          outputSchema,
	})
	if err != nil {
		t.Fatalf("compose live static-profile document: %v", err)
	}
	var output struct {
		Title  string `json:"title"`
		Source string `json:"source"`
	}
	if err := json.Unmarshal(result.Output, &output); err != nil {
		t.Fatalf("decode live artifact output: %v", err)
	}
	if output.Title != "Support delivery review" {
		t.Fatalf("live artifact title is %q, want %q", output.Title, "Support delivery review")
	}

	startedAt := time.Now()
	document, err := Compile(catalog, output.Source)
	compileDuration := time.Since(startedAt)
	if err != nil {
		t.Fatalf("compile live artifact source: %v\nsource:\n%s", err, output.Source)
	}
	seen := map[ComponentName]bool{}
	collectComponents(document.Root, seen)
	for _, name := range []ComponentName{
		ComponentHeading,
		ComponentText,
		ComponentMetric,
		ComponentTable,
		ComponentBarChart,
		ComponentMarkdown,
		ComponentCodeBlock,
		ComponentFileReference,
	} {
		if !seen[name] {
			t.Errorf("live artifact omitted required component %s", name)
		}
	}
	treeJSON, err := json.Marshal(document.Root)
	if err != nil {
		t.Fatalf("encode live compiled tree: %v", err)
	}
	for _, fact := range []string{
		"412",
		"17",
		"W1",
		"118",
		"W3",
		"157",
		"Platform",
		"142",
		"Runtime",
		"139",
		"https://example.com/support",
		"./scripts/go.sh test ./internal/conversation/artifactdoc",
		"docs/plans/openui-artifact-system-plan.md",
	} {
		if !strings.Contains(string(treeJSON), fact) {
			t.Errorf("live artifact omitted required fact %q", fact)
		}
	}
	t.Logf(
		"live output quality: instructionBytes=%d inputBytes=%d outputJSONBytes=%d sourceBytes=%d compile=%s",
		len(instructions),
		len(input),
		len(result.Output),
		len(output.Source),
		compileDuration,
	)
}

func liveArtifactDocAuthUnavailable(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "not logged in") ||
		strings.Contains(message, "authentication") ||
		strings.Contains(message, "unauthorized") ||
		strings.Contains(message, "login required")
}

func artifactDocModelPageContains(page agent.ModelPage, modelID string) bool {
	for _, model := range page.Data {
		if model.ID == modelID {
			return true
		}
	}
	return false
}
