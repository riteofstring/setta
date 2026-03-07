package codegen

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/statefs"
)

var (
	ErrPluginCodegenResolverRequired       = errors.New("codegen: plugin codegen worker spec resolver is required")
	ErrPluginCodegenSettaFilesRootRequired = errors.New("codegen: setta files root is required")
	ErrPluginCodegenTargetPayloadInvalid   = errors.New("codegen: plugin codegen target payload is invalid")
	ErrPluginCodegenTargetLanguageRequired = errors.New("codegen: plugin codegen target language is required")
	ErrPluginCodegenTargetLanguageMismatch = errors.New("codegen: plugin codegen target language does not match project state")
	ErrPluginCodegenTargetOptionsInvalid   = errors.New("codegen: plugin codegen target options payload must be an object")
	ErrPluginCodegenProjectStateInvalid    = errors.New("codegen: plugin codegen project state payload is invalid")
)

type WorkerSpecResolver interface {
	ResolvePluginCodegenWorkerSpec(ctx context.Context, targetID string) (plugins.BackendWorkerSpec, error)
}

type PluginMaterializerOptions struct {
	SettaFilesRoot string
	WorkerSpecs    WorkerSpecResolver
}

type PluginMaterializer struct {
	settaFilesRoot string
	workerSpecs    WorkerSpecResolver
}

type configuredPluginTarget struct {
	TargetID string
	Options  map[string]any
}

func NewPluginMaterializer(options PluginMaterializerOptions) (*PluginMaterializer, error) {
	if options.WorkerSpecs == nil {
		return nil, ErrPluginCodegenResolverRequired
	}
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, ErrPluginCodegenSettaFilesRootRequired
	}

	return &PluginMaterializer{
		settaFilesRoot: settaFilesRoot,
		workerSpecs:    options.WorkerSpecs,
	}, nil
}

func (m *PluginMaterializer) MaterializeProject(ctx context.Context, document projectstate.Document, projectID string) error {
	if m == nil || m.workerSpecs == nil {
		return ErrPluginCodegenResolverRequired
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}

	configuredTargets, err := resolveConfiguredPluginTargets(project.CodegenTargets)
	if err != nil {
		return err
	}

	outputRoot := pluginCodegenOutputRoot(m.settaFilesRoot, project.Name)
	if len(configuredTargets) == 0 {
		if err := os.RemoveAll(outputRoot); err != nil {
			return fmt.Errorf("remove plugin codegen output root: %w", err)
		}
		return nil
	}

	projectStatePayload, err := buildPluginProjectStatePayload(document, projectID)
	if err != nil {
		return err
	}

	currentTargetDirs := make(map[string]struct{}, len(configuredTargets))
	for _, target := range configuredTargets {
		targetDir := pluginCodegenTargetDirName(target.TargetID)
		currentTargetDirs[targetDir] = struct{}{}

		spec, err := m.workerSpecs.ResolvePluginCodegenWorkerSpec(ctx, target.TargetID)
		if err != nil {
			return err
		}

		runtime, err := plugins.StartCodegenRuntime(ctx, plugins.CodegenRuntimeStartOptions{
			WorkerSpec: spec,
		})
		if err != nil {
			return fmt.Errorf("start plugin codegen runtime for %s: %w", target.TargetID, err)
		}

		generatedFiles, generateErr := runtime.Generate(ctx, target.TargetID, projectStatePayload, target.Options)
		closeErr := runtime.Close()
		if generateErr != nil {
			if closeErr != nil {
				return errors.Join(generateErr, closeErr)
			}
			return fmt.Errorf("generate plugin codegen target %s: %w", target.TargetID, generateErr)
		}
		if closeErr != nil {
			return closeErr
		}

		targetRoot := filepath.Join(outputRoot, targetDir)
		if err := os.RemoveAll(targetRoot); err != nil {
			return fmt.Errorf("reset plugin codegen target root %s: %w", target.TargetID, err)
		}
		for _, generatedFile := range generatedFiles {
			outputPath, err := statefs.ResolveWithinRoot(targetRoot, filepath.FromSlash(generatedFile.RelativePath), "plugin codegen output path")
			if err != nil {
				return err
			}
			if err := statefs.AtomicWriteFile(outputPath, []byte(generatedFile.Content), 0o644); err != nil {
				return fmt.Errorf("write plugin codegen output %s: %w", generatedFile.RelativePath, err)
			}
		}
	}

	if err := pruneStalePluginCodegenTargets(outputRoot, currentTargetDirs); err != nil {
		return err
	}
	return nil
}

func (m *PluginMaterializer) MaterializeDocument(ctx context.Context, document projectstate.Document) error {
	if m == nil || m.workerSpecs == nil {
		return ErrPluginCodegenResolverRequired
	}

	projectIDs := make([]string, 0, len(document.Projects))
	expectedRoots := make(map[string]struct{}, len(document.Projects))
	for projectID, project := range document.Projects {
		projectIDs = append(projectIDs, projectID)
		expectedRoots[pluginCodegenOutputRoot(m.settaFilesRoot, project.Name)] = struct{}{}
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		if err := m.MaterializeProject(ctx, document, projectID); err != nil {
			return err
		}
	}

	if err := pruneStalePluginCodegenProjectRoots(m.settaFilesRoot, expectedRoots); err != nil {
		return err
	}
	return nil
}

func resolveConfiguredPluginTargets(codegenTargets []projectstate.ProjectCodegenTarget) ([]configuredPluginTarget, error) {
	configuredTargets := make([]configuredPluginTarget, 0, len(codegenTargets))
	for _, target := range codegenTargets {
		targetLanguage := strings.TrimSpace(target.Language)
		if targetLanguage == "" {
			return nil, ErrPluginCodegenTargetLanguageRequired
		}
		if targetLanguage == string(projectstate.CodeLanguagePython) {
			continue
		}

		options, err := decodePluginTargetOptions(target)
		if err != nil {
			return nil, err
		}
		configuredTargets = append(configuredTargets, configuredPluginTarget{
			TargetID: targetLanguage,
			Options:  options,
		})
	}
	return configuredTargets, nil
}

func decodePluginTargetOptions(target projectstate.ProjectCodegenTarget) (map[string]any, error) {
	if len(target.Payload) == 0 {
		return map[string]any{}, nil
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(target.Payload, &fields); err != nil {
		return nil, fmt.Errorf("%w: decode %q payload: %v", ErrPluginCodegenTargetPayloadInvalid, strings.TrimSpace(target.Language), err)
	}

	for key := range fields {
		if key == "language" || key == "options" {
			continue
		}
		return nil, fmt.Errorf("%w: unsupported field %q for %s", ErrPluginCodegenTargetPayloadInvalid, key, strings.TrimSpace(target.Language))
	}

	if rawLanguage, ok := fields["language"]; ok {
		var payloadLanguage string
		if err := json.Unmarshal(rawLanguage, &payloadLanguage); err != nil {
			return nil, fmt.Errorf("%w: language for %s must be a string", ErrPluginCodegenTargetPayloadInvalid, strings.TrimSpace(target.Language))
		}
		if strings.TrimSpace(payloadLanguage) == "" {
			return nil, ErrPluginCodegenTargetLanguageRequired
		}
		if strings.TrimSpace(payloadLanguage) != strings.TrimSpace(target.Language) {
			return nil, fmt.Errorf("%w: %s != %s", ErrPluginCodegenTargetLanguageMismatch, strings.TrimSpace(payloadLanguage), strings.TrimSpace(target.Language))
		}
	}

	options := map[string]any{}
	rawOptions, ok := fields["options"]
	if !ok {
		return options, nil
	}
	if err := json.Unmarshal(rawOptions, &options); err != nil {
		return nil, fmt.Errorf("%w: decode options for %s: %v", ErrPluginCodegenTargetOptionsInvalid, strings.TrimSpace(target.Language), err)
	}
	if options == nil {
		return map[string]any{}, nil
	}
	return options, nil
}

func buildPluginProjectStatePayload(document projectstate.Document, projectID string) (map[string]any, error) {
	singleConfig, err := projectview.SingleConfigByProjectID(document, projectID)
	if err != nil {
		return nil, err
	}

	encoded, err := json.Marshal(singleConfig)
	if err != nil {
		return nil, fmt.Errorf("%w: marshal project %s: %v", ErrPluginCodegenProjectStateInvalid, projectID, err)
	}

	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		return nil, fmt.Errorf("%w: decode project %s: %v", ErrPluginCodegenProjectStateInvalid, projectID, err)
	}
	return payload, nil
}

func pruneStalePluginCodegenTargets(outputRoot string, currentTargetDirs map[string]struct{}) error {
	entries, err := os.ReadDir(outputRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read plugin codegen output root: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, ok := currentTargetDirs[entry.Name()]; ok {
			continue
		}
		if err := os.RemoveAll(filepath.Join(outputRoot, entry.Name())); err != nil {
			return fmt.Errorf("remove stale plugin codegen target dir %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func pruneStalePluginCodegenProjectRoots(settaFilesRoot string, expectedRoots map[string]struct{}) error {
	sectionsRoot := filepath.Join(settaFilesRoot, "code", "sections")
	projectDirs, err := os.ReadDir(sectionsRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read plugin codegen sections root: %w", err)
	}

	for _, projectDir := range projectDirs {
		if !projectDir.IsDir() {
			continue
		}
		outputRoot := filepath.Join(sectionsRoot, projectDir.Name(), "plugin_codegen")
		if _, ok := expectedRoots[outputRoot]; ok {
			continue
		}
		info, err := os.Stat(outputRoot)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return fmt.Errorf("stat plugin codegen output root: %w", err)
		}
		if !info.IsDir() {
			continue
		}
		if err := os.RemoveAll(outputRoot); err != nil {
			return fmt.Errorf("remove stale plugin codegen output root %s: %w", outputRoot, err)
		}
	}
	return nil
}

func pluginCodegenOutputRoot(settaFilesRoot string, projectName string) string {
	return filepath.Join(projectstate.ProjectCodeSectionsRoot(settaFilesRoot, projectName), "plugin_codegen")
}

func pluginCodegenTargetDirName(targetID string) string {
	normalizedChars := make([]rune, 0, len(targetID))
	for _, char := range targetID {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' || char == '.' {
			normalizedChars = append(normalizedChars, char)
			continue
		}
		normalizedChars = append(normalizedChars, '_')
	}
	normalized := strings.Trim(string(normalizedChars), "_")
	if normalized == "" {
		normalized = "_"
	}
	digest := sha256.Sum256([]byte(targetID))
	return normalized + "__" + hex.EncodeToString(digest[:])[:12]
}
