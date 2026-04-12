package deployments

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	toml "github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"

	"setta/internal/projectstate"
)

func TestSharePublisherPublishWritesManifestPolicyProjectAndStripsPasswords(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	publishedAt := time.Date(2026, 3, 8, 14, 30, 0, 0, time.UTC)

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, passwordPublishDocument())
	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, publishedAt)

	result, err := publisher.Publish(context.Background(), SharePublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-share",
	})
	if err != nil {
		t.Fatalf("publish share deployment: %v", err)
	}

	if result.Manifest.DeploymentName != "demo-share" {
		t.Fatalf("expected deployment name demo-share, got %q", result.Manifest.DeploymentName)
	}
	if result.Manifest.CreatedAt != publishedAt {
		t.Fatalf("expected manifest createdAt %v, got %v", publishedAt, result.Manifest.CreatedAt)
	}
	if result.Policy.AllowRun {
		t.Fatal("expected default share policy to disable runs")
	}
	if result.Policy.AllowLLM {
		t.Fatal("expected default share policy to disable llm")
	}

	manifest, err := LoadManifest(result.Metadata.DeploymentRoot)
	if err != nil {
		t.Fatalf("load written manifest: %v", err)
	}
	if manifest.Listener != nil {
		t.Fatalf("did not expect listener config, got %#v", manifest.Listener)
	}
	policy, err := LoadPolicy(result.Metadata.DeploymentRoot)
	if err != nil {
		t.Fatalf("load written policy: %v", err)
	}
	if policy != result.Policy {
		t.Fatalf("expected persisted policy %#v, got %#v", result.Policy, policy)
	}

	publishedDocument := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	project := publishedDocument.Projects["project-alpha"]
	rawPayload := project.CodeObjImpls["password-impl"].Payload
	passwordPayload := decodeJSONObject(t, rawPayload)
	if got := rawStringField(passwordPayload, "value"); got != "" {
		t.Fatalf("expected published password value to be blank, got %q", got)
	}
	if got := rawStringField(passwordPayload, "defaultVal"); got != "" {
		t.Fatalf("expected published password defaultVal to be blank, got %q", got)
	}
	if got := boolField(passwordPayload, "hasSecret"); got {
		t.Fatalf("expected published password hasSecret false, got %#v", passwordPayload)
	}
}

func TestSharePublisherUsesLatestRuntimeSnapshotNotPersistedStore(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()

	document := simpleProjectDocument(false)
	runtime, store, _ := openSharePublishRuntime(t, settaFilesRoot, document)
	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 8, 15, 0, 0, 0, time.UTC))

	if _, err := runtime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.ShowParamDisplayNames = true
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime snapshot: %v", err)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted project: %v", err)
	}
	if persisted.Projects["project-alpha"].ShowParamDisplayNames {
		t.Fatal("did not expect unsaved runtime mutation to reach persisted project file")
	}

	result, err := publisher.Publish(context.Background(), SharePublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-share",
	})
	if err != nil {
		t.Fatalf("publish share deployment: %v", err)
	}

	published := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	if !published.Projects["project-alpha"].ShowParamDisplayNames {
		t.Fatal("expected published snapshot to use the latest runtime state")
	}
}

func TestSharePublisherWritesStructuredDataAndSupportsFormats(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name          string
		extension     string
		sourceContent string
	}{
		{name: "json", extension: ".json", sourceContent: "{\n  \"foo\": 1\n}\n"},
		{name: "yaml", extension: ".yaml", sourceContent: "foo: 1\n"},
		{name: "yml", extension: ".yml", sourceContent: "foo: 1\n"},
		{name: "toml", extension: ".toml", sourceContent: "foo = 1\n"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			settaFilesRoot := t.TempDir()
			workspaceRoot := t.TempDir()
			sourcePath := filepath.Join(settaFilesRoot, "json_sources", "source"+testCase.extension)
			writeTextFile(t, sourcePath, testCase.sourceContent)

			runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, jsonSourceDocument(sourcePath))
			publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 8, 15, 30, 0, 0, time.UTC))

			if _, err := runtime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
				if err := document.SetSectionCodeObjectValue("project-alpha", "dict-section", "foo-param", "999"); err != nil {
					return document, err
				}
				return document, nil
			}); err != nil {
				t.Fatalf("mutate json source value: %v", err)
			}

			result, err := publisher.Publish(context.Background(), SharePublishRequest{
				ProjectState:   runtime,
				ProjectID:      "project-alpha",
				DeploymentName: "demo-share",
			})
			if err != nil {
				t.Fatalf("publish share deployment: %v", err)
			}

			published := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
			project := published.Projects["project-alpha"]
			variant := project.SectionVariants["dict-variant"]
			if filepath.IsAbs(variant.Name) {
				t.Fatalf("expected rebased json source path, got absolute path %q", variant.Name)
			}
			targetPath := filepath.Join(result.Metadata.DeploymentRoot, filepath.FromSlash(variant.Name))
			parsed := readStructuredPayload(t, targetPath)
			if got := numericValue(t, parsed["foo"]); got != 999 {
				t.Fatalf("expected published structured value 999, got %#v", parsed["foo"])
			}

			original := readStructuredPayload(t, sourcePath)
			if got := numericValue(t, original["foo"]); got != 1 {
				t.Fatalf("expected source file to stay at 1, got %#v", original["foo"])
			}
		})
	}
}

func TestWriteStructuredDataPayloadRejectsNonJSONSubsetValues(t *testing.T) {
	t.Parallel()

	targetPath := filepath.Join(t.TempDir(), "source.yaml")
	err := writeStructuredDataPayload(targetPath, map[string]any{
		"timestamp": time.Date(2026, 3, 17, 9, 30, 0, 0, time.UTC),
	})
	if err == nil {
		t.Fatal("expected non-JSON-subset payload to fail")
	}
	if !errors.Is(err, ErrStructuredDataRootObjectRequired) {
		t.Fatalf("expected ErrStructuredDataRootObjectRequired, got %v", err)
	}
	if _, statErr := os.Stat(targetPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("expected no structured data file to be written, stat err=%v", statErr)
	}
}

func TestSharePublisherRebasesPathsAndCopiesFiles(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()

	imagePath := filepath.Join(settaFilesRoot, "artifacts", "image.png")
	chartPath := filepath.Join(settaFilesRoot, "artifacts", "chart.csv")
	drawDataPath := filepath.Join(settaFilesRoot, "artifacts", "draw", "data.png")
	drawTransformPath := filepath.Join(settaFilesRoot, "artifacts", "draw", "transform.json")
	codePath := filepath.Join(settaFilesRoot, "code", "sections", "alpha", "custom.py")
	jsonSourcePath := filepath.Join(settaFilesRoot, "json_sources", "source.json")

	writeBinaryFile(t, imagePath, []byte("image"))
	writeTextFile(t, chartPath, "x,y\n1,2\n")
	writeBinaryFile(t, drawDataPath, []byte("draw"))
	writeTextFile(t, drawTransformPath, "{\"transform\":[1,0,0,1,0,0]}\n")
	writeTextFile(t, codePath, "print('hello')\n")
	writeTextFile(t, jsonSourcePath, "{\n  \"foo\": 1\n}\n")

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, rebaseDocument(imagePath, chartPath, drawDataPath, drawTransformPath, codePath, jsonSourcePath))
	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 8, 16, 0, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), SharePublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-share",
	})
	if err != nil {
		t.Fatalf("publish share deployment: %v", err)
	}

	published := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	project := published.Projects["project-alpha"]

	imagePayload, err := project.EffectiveSectionPayload("image-section", "image-variant")
	if err != nil {
		t.Fatalf("effective image payload: %v", err)
	}
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, stringField(imagePayload, "imagePath"), filepath.Join(result.Metadata.DeploymentRoot, "artifacts"))

	chartPayload, err := project.EffectiveSectionPayload("chart-section", "chart-variant")
	if err != nil {
		t.Fatalf("effective chart payload: %v", err)
	}
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, stringField(chartPayload, "dataPath"), filepath.Join(result.Metadata.DeploymentRoot, "artifacts"))

	drawPayload, err := project.EffectiveSectionPayload("draw-section", "draw-variant")
	if err != nil {
		t.Fatalf("effective draw payload: %v", err)
	}
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, stringField(drawPayload, "renderedImagePath"), filepath.Join(result.Metadata.DeploymentRoot, "artifacts"))
	layers, ok := drawPayload["layers"].([]any)
	if !ok || len(layers) != 1 {
		t.Fatalf("expected one draw layer, got %#v", drawPayload["layers"])
	}
	layer, ok := layers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw layer object, got %#v", layers[0])
	}
	elements, ok := layer["elements"].([]any)
	if !ok || len(elements) != 1 {
		t.Fatalf("expected one draw element, got %#v", layer["elements"])
	}
	element, ok := elements[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw element object, got %#v", elements[0])
	}
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, stringField(element, "dataPath"), filepath.Join(result.Metadata.DeploymentRoot, "artifacts"))
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, stringField(element, "transformId"), filepath.Join(result.Metadata.DeploymentRoot, "artifacts"))

	codePayload, err := project.EffectiveSectionPayload("code-section", "code-variant")
	if err != nil {
		t.Fatalf("effective code payload: %v", err)
	}
	codeBinding, ok := objectField(codePayload, "codeFileBinding")
	if !ok {
		t.Fatalf("expected code file binding, got %#v", codePayload)
	}
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, stringField(codeBinding, "canonical_path"), filepath.Join(result.Metadata.DeploymentRoot, "code"))

	dictVariant := project.SectionVariants["dict-variant"]
	assertPublishedPathExistsWithin(t, result.Metadata.DeploymentRoot, dictVariant.Name, filepath.Join(result.Metadata.DeploymentRoot, "json_sources"))
}

func TestSharePublisherRewriteSectionPayloadRebasesSectionAssetsAndJSONSourceVariant(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	deploymentRoot := t.TempDir()

	imagePath := filepath.Join(settaFilesRoot, "artifacts", "image.png")
	chartPath := filepath.Join(settaFilesRoot, "artifacts", "chart.csv")
	drawDataPath := filepath.Join(settaFilesRoot, "artifacts", "draw", "data.png")
	drawTransformPath := filepath.Join(settaFilesRoot, "artifacts", "draw", "transform.json")
	codePath := filepath.Join(settaFilesRoot, "code", "sections", "alpha", "custom.py")
	jsonSourcePath := filepath.Join(settaFilesRoot, "json_sources", "source.json")

	writeBinaryFile(t, imagePath, []byte("image"))
	writeTextFile(t, chartPath, "x,y\n1,2\n")
	writeBinaryFile(t, drawDataPath, []byte("draw"))
	writeTextFile(t, drawTransformPath, "{\"transform\":[1,0,0,1,0,0]}\n")
	writeTextFile(t, codePath, "print('hello')\n")
	writeTextFile(t, jsonSourcePath, "{\n  \"foo\": 1\n}\n")

	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC))
	project := rebaseDocument(imagePath, chartPath, drawDataPath, drawTransformPath, codePath, jsonSourcePath).Projects["project-alpha"]
	pathMaps := publishPathMaps{
		artifact: map[string]string{},
		code:     map[string]string{},
		json:     map[string]string{},
	}

	for _, target := range []struct {
		sectionID string
		variantID string
	}{
		{sectionID: "image-section", variantID: "image-variant"},
		{sectionID: "chart-section", variantID: "chart-variant"},
		{sectionID: "draw-section", variantID: "draw-variant"},
		{sectionID: "code-section", variantID: "code-variant"},
		{sectionID: "dict-section", variantID: "dict-variant"},
	} {
		payload, err := project.EffectiveSectionPayload(target.sectionID, target.variantID)
		if err != nil {
			t.Fatalf("effective payload for %s: %v", target.sectionID, err)
		}
		if err := publisher.rewriteSectionPayload(&project, target.sectionID, target.variantID, payload, deploymentRoot, pathMaps); err != nil {
			t.Fatalf("rewrite section payload for %s: %v", target.sectionID, err)
		}
	}

	imagePayload, err := project.EffectiveSectionPayload("image-section", "image-variant")
	if err != nil {
		t.Fatalf("effective image payload: %v", err)
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(imagePayload, "imagePath"), filepath.Join(deploymentRoot, "artifacts"))

	chartPayload, err := project.EffectiveSectionPayload("chart-section", "chart-variant")
	if err != nil {
		t.Fatalf("effective chart payload: %v", err)
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(chartPayload, "dataPath"), filepath.Join(deploymentRoot, "artifacts"))

	drawPayload, err := project.EffectiveSectionPayload("draw-section", "draw-variant")
	if err != nil {
		t.Fatalf("effective draw payload: %v", err)
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(drawPayload, "renderedImagePath"), filepath.Join(deploymentRoot, "artifacts"))
	layers, ok := drawPayload["layers"].([]any)
	if !ok || len(layers) != 1 {
		t.Fatalf("expected one draw layer, got %#v", drawPayload["layers"])
	}
	layer, ok := layers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw layer object, got %#v", layers[0])
	}
	elements, ok := layer["elements"].([]any)
	if !ok || len(elements) != 1 {
		t.Fatalf("expected one draw element, got %#v", layer["elements"])
	}
	element, ok := elements[0].(map[string]any)
	if !ok {
		t.Fatalf("expected draw element object, got %#v", elements[0])
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(element, "dataPath"), filepath.Join(deploymentRoot, "artifacts"))
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(element, "transformId"), filepath.Join(deploymentRoot, "artifacts"))

	codePayload, err := project.EffectiveSectionPayload("code-section", "code-variant")
	if err != nil {
		t.Fatalf("effective code payload: %v", err)
	}
	codeBinding, ok := objectField(codePayload, "codeFileBinding")
	if !ok {
		t.Fatalf("expected code file binding, got %#v", codePayload)
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(codeBinding, "canonical_path"), filepath.Join(deploymentRoot, "code"))

	dictVariant := project.SectionVariants["dict-variant"]
	if filepath.IsAbs(dictVariant.Name) {
		t.Fatalf("expected rebased json source path, got absolute path %q", dictVariant.Name)
	}
	if _, ok := relativeWithinRoot(filepath.Join(deploymentRoot, "json_sources"), filepath.Join(deploymentRoot, filepath.FromSlash(dictVariant.Name))); !ok {
		t.Fatalf("expected rebased json source path %q to stay within deployment json_sources", dictVariant.Name)
	}
}

func TestSharePublisherRebasesProjectGeneratedCodeBinding(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	codePath := filepath.Join(settaFilesRoot, "code", "sections", "alpha", "setta_gen.py")
	writeTextFile(t, codePath, "print('generated')\n")

	document := simpleProjectDocument(false)
	project := document.Projects["project-alpha"]
	project.GeneratedCodeBinding = &projectstate.CodeFileBinding{
		Path:        filepath.ToSlash(filepath.Join("code", "sections", "alpha", "setta_gen.py")),
		AccessMode:  projectstate.CodeFileAccessModeWriteOnly,
		AutoBinding: false,
	}
	document.Projects["project-alpha"] = project

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, document)
	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 8, 16, 15, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), SharePublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-share",
	})
	if err != nil {
		t.Fatalf("publish share deployment: %v", err)
	}

	published := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	publishedProject := published.Projects["project-alpha"]
	if publishedProject.GeneratedCodeBinding == nil {
		t.Fatal("expected published generated code binding")
	}
	assertPublishedPathExistsWithin(
		t,
		result.Metadata.DeploymentRoot,
		publishedProject.GeneratedCodeBinding.Path,
		filepath.Join(result.Metadata.DeploymentRoot, "code"),
	)
}

func TestSharePublisherRebasesDropzoneAndChatAttachmentPaths(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	attachmentPath := filepath.Join(settaFilesRoot, "artifacts", "old.txt")
	writeTextFile(t, attachmentPath, "attachment\n")

	runtime, _, _ := openSharePublishRuntime(
		t,
		settaFilesRoot,
		attachmentRebaseDocument(filepath.ToSlash(filepath.Join("artifacts", "old.txt"))),
	)
	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 8, 16, 20, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), SharePublishRequest{
		ProjectState:   runtime,
		ProjectID:      "project-alpha",
		DeploymentName: "demo-share",
	})
	if err != nil {
		t.Fatalf("publish share deployment: %v", err)
	}

	published := loadPublishedDocument(t, result.Metadata.DeploymentRoot)
	project := published.Projects["project-alpha"]

	chatPayload, err := project.EffectiveSectionPayload("chat-section", "chat-variant")
	if err != nil {
		t.Fatalf("effective chat payload: %v", err)
	}
	messages, ok := chatPayload["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected one published chat message, got %#v", chatPayload["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected published chat message object, got %#v", messages[0])
	}
	chatAttachments := rawAttachmentList(message["attachments"])
	if len(chatAttachments) != 1 {
		t.Fatalf("expected one published chat attachment, got %#v", message["attachments"])
	}
	chatAttachment, ok := chatAttachments[0].(map[string]any)
	if !ok {
		t.Fatalf("expected published chat attachment object, got %#v", chatAttachments[0])
	}
	assertPublishedPathExistsWithin(
		t,
		result.Metadata.DeploymentRoot,
		stringField(chatAttachment, "id"),
		filepath.Join(result.Metadata.DeploymentRoot, "artifacts"),
	)

	dropzonePayload, _, _, _, err := project.ResolveSectionCodeObject("dict-section", "dropzone-param")
	if err != nil {
		t.Fatalf("resolve dropzone payload: %v", err)
	}
	var storedDropzone map[string]any
	if err := json.Unmarshal([]byte(rawStringField(dropzonePayload, "value")), &storedDropzone); err != nil {
		t.Fatalf("decode published dropzone payload: %v", err)
	}
	dropzoneAttachments := rawAttachmentList(storedDropzone["attachments"])
	if len(dropzoneAttachments) != 1 {
		t.Fatalf("expected one published dropzone attachment, got %#v", storedDropzone["attachments"])
	}
	dropzoneAttachment, ok := dropzoneAttachments[0].(map[string]any)
	if !ok {
		t.Fatalf("expected published dropzone attachment object, got %#v", dropzoneAttachments[0])
	}
	assertPublishedPathExistsWithin(
		t,
		result.Metadata.DeploymentRoot,
		stringField(dropzoneAttachment, "id"),
		filepath.Join(result.Metadata.DeploymentRoot, "artifacts"),
	)
}

func TestSharePublisherRewriteSectionPayloadRewritesChatBranchesAndDropzoneAttachments(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	deploymentRoot := t.TempDir()
	attachmentRelativePath := filepath.ToSlash(filepath.Join("artifacts", "old.txt"))

	writeTextFile(t, filepath.Join(settaFilesRoot, filepath.FromSlash(attachmentRelativePath)), "attachment\n")

	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 9, 9, 15, 0, 0, time.UTC))
	project := attachmentRebaseDocument(attachmentRelativePath).Projects["project-alpha"]
	pathMaps := publishPathMaps{
		artifact: map[string]string{},
		code:     map[string]string{},
		json:     map[string]string{},
	}

	chatPayload, err := project.EffectiveSectionPayload("chat-section", "chat-variant")
	if err != nil {
		t.Fatalf("effective chat payload: %v", err)
	}
	chatPayload["branches"] = map[string]any{
		"branch-1": map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "message-2",
					"role": "assistant",
					"attachments": []any{
						map[string]any{
							"id":       attachmentRelativePath,
							"name":     "old.txt",
							"mimeType": "text/plain",
							"size":     10,
						},
					},
				},
			},
		},
	}
	if err := publisher.rewriteSectionPayload(&project, "chat-section", "chat-variant", chatPayload, deploymentRoot, pathMaps); err != nil {
		t.Fatalf("rewrite chat payload: %v", err)
	}

	dictPayload, err := project.EffectiveSectionPayload("dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effective dict payload: %v", err)
	}
	if err := publisher.rewriteSectionPayload(&project, "dict-section", "dict-variant", dictPayload, deploymentRoot, pathMaps); err != nil {
		t.Fatalf("rewrite dict payload: %v", err)
	}

	updatedChatPayload, err := project.EffectiveSectionPayload("chat-section", "chat-variant")
	if err != nil {
		t.Fatalf("effective rewritten chat payload: %v", err)
	}
	messages, ok := updatedChatPayload["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected one rewritten chat message, got %#v", updatedChatPayload["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected chat message object, got %#v", messages[0])
	}
	chatAttachments := rawAttachmentList(message["attachments"])
	if len(chatAttachments) != 1 {
		t.Fatalf("expected one rewritten chat attachment, got %#v", message["attachments"])
	}
	chatAttachment, ok := chatAttachments[0].(map[string]any)
	if !ok {
		t.Fatalf("expected rewritten chat attachment object, got %#v", chatAttachments[0])
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(chatAttachment, "id"), filepath.Join(deploymentRoot, "artifacts"))

	branches, ok := updatedChatPayload["branches"].(map[string]any)
	if !ok {
		t.Fatalf("expected rewritten branches, got %#v", updatedChatPayload["branches"])
	}
	branch, ok := branches["branch-1"].(map[string]any)
	if !ok {
		t.Fatalf("expected branch object, got %#v", branches["branch-1"])
	}
	branchMessages, ok := branch["messages"].([]any)
	if !ok || len(branchMessages) != 1 {
		t.Fatalf("expected one rewritten branch message, got %#v", branch["messages"])
	}
	branchMessage, ok := branchMessages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected branch message object, got %#v", branchMessages[0])
	}
	branchAttachments := rawAttachmentList(branchMessage["attachments"])
	if len(branchAttachments) != 1 {
		t.Fatalf("expected one rewritten branch attachment, got %#v", branchMessage["attachments"])
	}
	branchAttachment, ok := branchAttachments[0].(map[string]any)
	if !ok {
		t.Fatalf("expected rewritten branch attachment object, got %#v", branchAttachments[0])
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(branchAttachment, "id"), filepath.Join(deploymentRoot, "artifacts"))

	dropzonePayload, _, _, _, err := project.ResolveSectionCodeObject("dict-section", "dropzone-param")
	if err != nil {
		t.Fatalf("resolve dropzone payload: %v", err)
	}
	var storedDropzone map[string]any
	if err := json.Unmarshal([]byte(rawStringField(dropzonePayload, "value")), &storedDropzone); err != nil {
		t.Fatalf("decode rewritten dropzone payload: %v", err)
	}
	dropzoneAttachments := rawAttachmentList(storedDropzone["attachments"])
	if len(dropzoneAttachments) != 1 {
		t.Fatalf("expected one rewritten dropzone attachment, got %#v", storedDropzone["attachments"])
	}
	dropzoneAttachment, ok := dropzoneAttachments[0].(map[string]any)
	if !ok {
		t.Fatalf("expected rewritten dropzone attachment object, got %#v", dropzoneAttachments[0])
	}
	assertPublishedPathExistsWithin(t, deploymentRoot, stringField(dropzoneAttachment, "id"), filepath.Join(deploymentRoot, "artifacts"))

	if stringField(chatAttachment, "id") != stringField(branchAttachment, "id") || stringField(chatAttachment, "id") != stringField(dropzoneAttachment, "id") {
		t.Fatalf("expected all rewritten attachment ids to share the same rebased path, got chat=%q branch=%q dropzone=%q", stringField(chatAttachment, "id"), stringField(branchAttachment, "id"), stringField(dropzoneAttachment, "id"))
	}
}

func TestSharePublisherCopiesListenerEntrypoint(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	listenerRelativePath := filepath.ToSlash(filepath.Join("listeners", "app.py"))
	listenerSourcePath := filepath.Join(workspaceRoot, "listeners", "app.py")
	writeTextFile(t, listenerSourcePath, "print('listener')\n")

	runtime, _, _ := openSharePublishRuntime(t, settaFilesRoot, simpleProjectDocument(false))
	publisher := openTestSharePublisher(t, settaFilesRoot, workspaceRoot, time.Date(2026, 3, 8, 16, 30, 0, 0, time.UTC))

	result, err := publisher.Publish(context.Background(), SharePublishRequest{
		ProjectState:       runtime,
		ProjectID:          "project-alpha",
		DeploymentName:     "demo-share",
		ListenerEntrypoint: listenerRelativePath,
		ListenerEnabled:    true,
	})
	if err != nil {
		t.Fatalf("publish share deployment: %v", err)
	}

	if result.Manifest.Listener == nil {
		t.Fatal("expected listener config in manifest")
	}
	if result.Manifest.Listener.Entrypoint != "listener/app.py" {
		t.Fatalf("expected listener entrypoint listener/app.py, got %q", result.Manifest.Listener.Entrypoint)
	}
	if !result.Manifest.Listener.Enabled {
		t.Fatal("expected listener to be enabled")
	}

	listenerTargetPath := filepath.Join(result.Metadata.DeploymentRoot, "listener", "app.py")
	content, err := os.ReadFile(listenerTargetPath)
	if err != nil {
		t.Fatalf("read copied listener entrypoint: %v", err)
	}
	if string(content) != "print('listener')\n" {
		t.Fatalf("unexpected listener file content %q", string(content))
	}
}

func openSharePublishRuntime(t *testing.T, settaFilesRoot string, document projectstate.Document) (*projectstate.Runtime, *projectstate.Store, string) {
	t.Helper()

	store, err := projectstate.NewStore(filepath.Join(settaFilesRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("create project store: %v", err)
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save project store: %v", err)
	}
	runtime, err := projectstate.OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})
	return runtime, store, store.Path()
}

func openTestSharePublisher(t *testing.T, settaFilesRoot string, workspaceRoot string, publishedAt time.Time) *SharePublisher {
	t.Helper()

	catalogRoot, err := DefaultCatalogRoot(settaFilesRoot)
	if err != nil {
		t.Fatalf("default catalog root: %v", err)
	}
	catalog, err := NewCatalog(CatalogOptions{Root: catalogRoot})
	if err != nil {
		t.Fatalf("new deployment catalog: %v", err)
	}
	publisher, err := NewSharePublisher(SharePublisherOptions{
		Catalog:        catalog,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		Now: func() time.Time {
			return publishedAt
		},
	})
	if err != nil {
		t.Fatalf("new share publisher: %v", err)
	}
	return publisher
}

func loadPublishedDocument(t *testing.T, deploymentRoot string) projectstate.Document {
	t.Helper()

	store, err := projectstate.NewStore(filepath.Join(deploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open deployment project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load deployment project: %v", err)
	}
	return document
}

func simpleProjectDocument(showParamDisplayNames bool) projectstate.Document {
	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:                    "project-alpha",
				Name:                  "Alpha",
				ShowParamDisplayNames: showParamDisplayNames,
			},
		},
	}.Normalized()
	if err != nil {
		panic(err)
	}
	return document
}

func passwordPublishDocument() projectstate.Document {
	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodeObjs: map[string]projectstate.CodeObject{
					"password-param": {
						ID:               "password-param",
						Name:             "password_param",
						VariantIDs:       []string{"password-variant"},
						DefaultVariantID: "password-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"password-variant": {
						ID:     "password-variant",
						ImplID: "password-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"password-impl": {
						ID:   "password-impl",
						Type: "PasswordParam",
						Payload: mustProjectPayload(map[string]any{
							"id":         "password-impl",
							"type":       "PasswordParam",
							"value":      "hidden",
							"defaultVal": "seed",
							"hasSecret":  true,
						}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		panic(err)
	}
	return document
}

func jsonSourceDocument(sourcePath string) projectstate.Document {
	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"dict-section": "dict-variant",
				},
				Sections: map[string]projectstate.Section{
					"dict-section": {
						ID:               "dict-section",
						Name:             "Dictionary",
						VariantIDs:       []string{"dict-variant"},
						DefaultVariantID: "dict-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"dict-variant": {
						ID:     "dict-variant",
						Name:   sourcePath,
						ImplID: "dict-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"dict-impl": {
						ID:      "dict-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustProjectPayload(map[string]any{"id": "dict-impl", "type": "Dict", "isJsonSource": true, "topLevelParamId": "json-root", "codeObjVariantMap": map[string]string{"json-root": "json-root-variant", "foo-param": "foo-param-variant"}}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"json-root": {
						ID:               "json-root",
						Name:             "root",
						VariantIDs:       []string{"json-root-variant"},
						DefaultVariantID: "json-root-variant",
					},
					"foo-param": {
						ID:               "foo-param",
						Name:             "foo",
						VariantIDs:       []string{"foo-param-variant"},
						DefaultVariantID: "foo-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"json-root-variant": {
						ID:     "json-root-variant",
						ImplID: "json-root-impl",
					},
					"foo-param-variant": {
						ID:     "foo-param-variant",
						ImplID: "foo-param-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"json-root-impl": {
						ID:      "json-root-impl",
						Type:    "NestedParam",
						Payload: mustProjectPayload(map[string]any{"id": "json-root-impl", "type": "NestedParam", "children": []string{"foo-param"}}),
					},
					"foo-param-impl": {
						ID:      "foo-param-impl",
						Type:    "TextParam",
						Payload: mustProjectPayload(map[string]any{"id": "foo-param-impl", "type": "TextParam", "value": "1"}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		panic(err)
	}
	return document
}

func rebaseDocument(imagePath string, chartPath string, drawDataPath string, drawTransformPath string, codePath string, jsonSourcePath string) projectstate.Document {
	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"image-section": "image-variant",
					"chart-section": "chart-variant",
					"draw-section":  "draw-variant",
					"code-section":  "code-variant",
					"dict-section":  "dict-variant",
				},
				Sections: map[string]projectstate.Section{
					"image-section": {
						ID:               "image-section",
						Name:             "Image",
						VariantIDs:       []string{"image-variant"},
						DefaultVariantID: "image-variant",
					},
					"chart-section": {
						ID:               "chart-section",
						Name:             "Chart",
						VariantIDs:       []string{"chart-variant"},
						DefaultVariantID: "chart-variant",
					},
					"draw-section": {
						ID:               "draw-section",
						Name:             "Draw",
						VariantIDs:       []string{"draw-variant"},
						DefaultVariantID: "draw-variant",
					},
					"code-section": {
						ID:               "code-section",
						Name:             "Code",
						VariantIDs:       []string{"code-variant"},
						DefaultVariantID: "code-variant",
					},
					"dict-section": {
						ID:               "dict-section",
						Name:             "Dictionary",
						VariantIDs:       []string{"dict-variant"},
						DefaultVariantID: "dict-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"image-variant": {ID: "image-variant", ImplID: "image-impl"},
					"chart-variant": {ID: "chart-variant", ImplID: "chart-impl"},
					"draw-variant":  {ID: "draw-variant", ImplID: "draw-impl"},
					"code-variant":  {ID: "code-variant", ImplID: "code-impl"},
					"dict-variant":  {ID: "dict-variant", Name: jsonSourcePath, ImplID: "dict-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"image-impl": {
						ID:      "image-impl",
						Kind:    projectstate.SectionKind("image"),
						Payload: mustProjectPayload(map[string]any{"id": "image-impl", "type": "Image", "imagePath": imagePath}),
					},
					"chart-impl": {
						ID:      "chart-impl",
						Kind:    projectstate.SectionKind("chart"),
						Payload: mustProjectPayload(map[string]any{"id": "chart-impl", "type": "Chart", "dataPath": chartPath}),
					},
					"draw-impl": {
						ID:   "draw-impl",
						Kind: projectstate.SectionKindDraw,
						Draw: &projectstate.DrawSectionImpl{
							RenderedImagePath: drawDataPath,
						},
						Payload: mustProjectPayload(map[string]any{
							"id":                "draw-impl",
							"type":              "Draw",
							"renderedImagePath": drawDataPath,
							"layers": []any{
								map[string]any{
									"name": "Layer",
									"elements": []any{
										map[string]any{
											"type":        "Image",
											"dataPath":    drawDataPath,
											"transformId": drawTransformPath,
										},
									},
								},
							},
						}),
					},
					"code-impl": {
						ID:   "code-impl",
						Kind: projectstate.SectionKind("frontend"),
						Payload: mustProjectPayload(map[string]any{
							"id":   "code-impl",
							"type": "Code",
							"codeFileBinding": map[string]any{
								"canonical_path": codePath,
								"access_mode":    "read_write",
								"autoBinding":    false,
							},
						}),
					},
					"dict-impl": {
						ID:      "dict-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustProjectPayload(map[string]any{"id": "dict-impl", "type": "Dict", "isJsonSource": true, "topLevelParamId": "json-root", "codeObjVariantMap": map[string]string{"json-root": "json-root-variant", "foo-param": "foo-param-variant"}}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"json-root": {
						ID:               "json-root",
						Name:             "root",
						VariantIDs:       []string{"json-root-variant"},
						DefaultVariantID: "json-root-variant",
					},
					"foo-param": {
						ID:               "foo-param",
						Name:             "foo",
						VariantIDs:       []string{"foo-param-variant"},
						DefaultVariantID: "foo-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"json-root-variant": {ID: "json-root-variant", ImplID: "json-root-impl"},
					"foo-param-variant": {ID: "foo-param-variant", ImplID: "foo-param-impl"},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"json-root-impl": {
						ID:      "json-root-impl",
						Type:    "NestedParam",
						Payload: mustProjectPayload(map[string]any{"id": "json-root-impl", "type": "NestedParam", "children": []string{"foo-param"}}),
					},
					"foo-param-impl": {
						ID:      "foo-param-impl",
						Type:    "TextParam",
						Payload: mustProjectPayload(map[string]any{"id": "foo-param-impl", "type": "TextParam", "value": "1"}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		panic(err)
	}
	return document
}

func attachmentRebaseDocument(attachmentPath string) projectstate.Document {
	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"chat-section": "chat-variant",
					"dict-section": "dict-variant",
				},
				Sections: map[string]projectstate.Section{
					"chat-section": {
						ID:               "chat-section",
						Name:             "Chat",
						VariantIDs:       []string{"chat-variant"},
						DefaultVariantID: "chat-variant",
					},
					"dict-section": {
						ID:               "dict-section",
						Name:             "Dictionary",
						VariantIDs:       []string{"dict-variant"},
						DefaultVariantID: "dict-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant": {ID: "chat-variant", ImplID: "chat-impl"},
					"dict-variant": {ID: "dict-variant", ImplID: "dict-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl": {
						ID:   "chat-impl",
						Kind: projectstate.SectionKind("frontend"),
						Payload: mustProjectPayload(map[string]any{
							"id":   "chat-impl",
							"type": "Chat",
							"messages": []any{
								map[string]any{
									"id":   "message-1",
									"role": "user",
									"content": []any{
										map[string]any{
											"type": "text",
											"text": "Hello",
										},
									},
									"attachments": []any{
										map[string]any{
											"id":       attachmentPath,
											"name":     "old.txt",
											"mimeType": "text/plain",
											"size":     10,
										},
									},
								},
							},
						}),
					},
					"dict-impl": {
						ID:   "dict-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: mustProjectPayload(map[string]any{
							"id":              "dict-impl",
							"type":            "Dict",
							"topLevelParamId": "dropzone-root",
							"codeObjVariantMap": map[string]string{
								"dropzone-root":  "dropzone-root-variant",
								"dropzone-param": "dropzone-param-variant",
							},
						}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"dropzone-root": {
						ID:               "dropzone-root",
						Name:             "root",
						VariantIDs:       []string{"dropzone-root-variant"},
						DefaultVariantID: "dropzone-root-variant",
					},
					"dropzone-param": {
						ID:               "dropzone-param",
						Name:             "uploads",
						VariantIDs:       []string{"dropzone-param-variant"},
						DefaultVariantID: "dropzone-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"dropzone-root-variant":  {ID: "dropzone-root-variant", ImplID: "dropzone-root-impl"},
					"dropzone-param-variant": {ID: "dropzone-param-variant", ImplID: "dropzone-param-impl"},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"dropzone-root-impl": {
						ID:      "dropzone-root-impl",
						Type:    "NestedParam",
						Payload: mustProjectPayload(map[string]any{"id": "dropzone-root-impl", "type": "NestedParam", "children": []string{"dropzone-param"}}),
					},
					"dropzone-param-impl": {
						ID:   "dropzone-param-impl",
						Type: "DropzoneParam",
						Payload: mustProjectPayload(map[string]any{
							"id":    "dropzone-param-impl",
							"type":  "DropzoneParam",
							"mode":  "STATEFUL",
							"value": `{"version":1,"attachments":[{"kind":"file","id":"` + attachmentPath + `","name":"old.txt","mimeType":"text/plain","size":10}]}`,
						}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		panic(err)
	}
	return document
}

func mustProjectPayload(value map[string]any) projectstate.RawJSON {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}

func decodeJSONObject(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()

	object := map[string]any{}
	if err := json.Unmarshal(raw, &object); err != nil {
		t.Fatalf("decode json object: %v", err)
	}
	return object
}

func readStructuredPayload(t *testing.T, path string) map[string]any {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read structured payload %q: %v", path, err)
	}

	var decoded map[string]any
	switch strings.ToLower(filepath.Ext(path)) {
	case ".json":
		if err := json.Unmarshal(content, &decoded); err != nil {
			t.Fatalf("decode json payload %q: %v", path, err)
		}
	case ".yaml", ".yml":
		var raw map[string]any
		if err := yaml.Unmarshal(content, &raw); err != nil {
			t.Fatalf("decode yaml payload %q: %v", path, err)
		}
		decoded = normalizeStructuredPayload(t, raw)
	case ".toml":
		var raw map[string]any
		if err := toml.Unmarshal(content, &raw); err != nil {
			t.Fatalf("decode toml payload %q: %v", path, err)
		}
		decoded = normalizeStructuredPayload(t, raw)
	default:
		t.Fatalf("unsupported structured payload extension for %q", path)
	}
	return decoded
}

func normalizeStructuredPayload(t *testing.T, raw map[string]any) map[string]any {
	t.Helper()

	encoded, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("re-encode structured payload: %v", err)
	}
	normalized := map[string]any{}
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		t.Fatalf("normalize structured payload: %v", err)
	}
	return normalized
}

func numericValue(t *testing.T, value any) float64 {
	t.Helper()

	number, ok := value.(float64)
	if !ok {
		t.Fatalf("expected numeric value, got %#v", value)
	}
	return number
}

func writeTextFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %q: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %q: %v", path, err)
	}
}

func writeBinaryFile(t *testing.T, path string, content []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %q: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write %q: %v", path, err)
	}
}

func assertPublishedPathExistsWithin(t *testing.T, deploymentRoot string, relativePath string, expectedRoot string) {
	t.Helper()

	if filepath.IsAbs(relativePath) {
		t.Fatalf("expected relative deployment path, got %q", relativePath)
	}
	absolutePath := filepath.Join(deploymentRoot, filepath.FromSlash(relativePath))
	if _, err := os.Stat(absolutePath); err != nil {
		t.Fatalf("stat published path %q: %v", absolutePath, err)
	}
	if _, ok := relativeWithinRoot(expectedRoot, absolutePath); !ok {
		t.Fatalf("expected %q to be within %q", absolutePath, expectedRoot)
	}
}
