package plugins

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/pelletier/go-toml/v2"

	"setta/internal/statefs"
)

const pluginManifestSchemaVersion = 1

type InitTemplateOptions struct {
	PluginID string
	Template string
	OutDir   string
}

type ValidateFolderOptions struct {
	PluginRoot string
}

type LinkOptions struct {
	LocalPluginRoot string
	Scope           *PluginScope
	Enable          bool
	Force           bool
}

func (s *Service) InitTemplate(options InitTemplateOptions) (string, error) {
	if s == nil || s.store == nil {
		return "", ErrWorkspaceRootRequired
	}

	normalizedID, err := normalizeAndValidateInitPluginID(options.PluginID)
	if err != nil {
		return "", err
	}
	template, err := normalizeInitTemplate(options.Template)
	if err != nil {
		return "", err
	}

	root, err := resolveInitTemplateRoot(s.store.workspaceRoot, normalizedID, options.OutDir)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(root); err == nil {
		return "", newServiceError(ServiceErrorCodeInitTargetExists, "Plugin folder already exists: %s", root)
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("stat plugin template root %s: %w", root, err)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", fmt.Errorf("create plugin template root %s: %w", root, err)
	}

	manifest := PluginManifest{
		SchemaVersion:     pluginManifestSchemaVersion,
		ID:                normalizedID,
		Name:              normalizedID,
		Version:           "0.1.0",
		SettaVersionRange: ">=0.0.0",
		EnabledByDefault:  false,
		Capabilities:      []string{},
	}

	switch template {
	case "backend":
		if err := scaffoldBackendTemplate(root, normalizedID); err != nil {
			return "", err
		}
		manifest.Backend = &PluginBackendManifest{
			Entrypoint: "backend/main.go",
		}
	case "frontend":
		if err := scaffoldFrontendTemplate(root); err != nil {
			return "", err
		}
		manifest.Frontend = &PluginFrontendManifest{
			Entrypoint: "frontend/dist/index.js",
			Style:      "frontend/dist/index.css",
		}
	case "content":
		if err := scaffoldContentTemplate(root); err != nil {
			return "", err
		}
		manifest.Content = &PluginContentManifest{
			BlueprintsDir:       "content/blueprints",
			ProjectTemplatesDir: "content/project_templates",
			PromptsDir:          "content/prompts",
		}
	case "full":
		if err := scaffoldBackendTemplate(root, normalizedID); err != nil {
			return "", err
		}
		if err := scaffoldFrontendTemplate(root); err != nil {
			return "", err
		}
		if err := scaffoldContentTemplate(root); err != nil {
			return "", err
		}
		manifest.Backend = &PluginBackendManifest{
			Entrypoint: "backend/main.go",
		}
		manifest.Frontend = &PluginFrontendManifest{
			Entrypoint: "frontend/dist/index.js",
			Style:      "frontend/dist/index.css",
		}
		manifest.Content = &PluginContentManifest{
			BlueprintsDir:       "content/blueprints",
			ProjectTemplatesDir: "content/project_templates",
			PromptsDir:          "content/prompts",
		}
	default:
		return "", newServiceError(ServiceErrorCodeSourceInvalid, "Invalid plugin init template: %q", template)
	}

	manifestPayload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal plugin manifest: %w", err)
	}
	if err := os.WriteFile(filepath.Join(root, pluginManifestFileName), manifestPayload, 0o644); err != nil {
		return "", fmt.Errorf("write plugin manifest: %w", err)
	}
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte(buildInitTemplatePyproject(normalizedID, manifest)), 0o644); err != nil {
		return "", fmt.Errorf("write pyproject.toml: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".github", "workflows"), 0o755); err != nil {
		return "", fmt.Errorf("create workflow directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".github", "workflows", "release.yml"), []byte(initTemplateWorkflow), 0o644); err != nil {
		return "", fmt.Errorf("write release workflow: %w", err)
	}
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte(buildInitTemplateREADME(normalizedID, manifest)), 0o644); err != nil {
		return "", fmt.Errorf("write plugin README: %w", err)
	}
	return root, nil
}

func (s *Service) ValidateFolder(options ValidateFolderOptions) (string, error) {
	if s == nil {
		return "", ErrWorkspaceRootRequired
	}
	root, manifest, err := s.validateLocalPluginSource(options.PluginRoot)
	if err != nil {
		return "", err
	}
	if err := s.validateMetadataIdentity(root, manifest); err != nil {
		return "", err
	}
	if err := ValidateGoBackendBuild(root, manifest); err != nil {
		return "", err
	}
	return root, nil
}

func (s *Service) Link(options LinkOptions) (PluginInstallResult, error) {
	if s == nil {
		return PluginInstallResult{}, ErrWorkspaceRootRequired
	}

	sourceRoot, manifest, err := s.validateLocalPluginSource(options.LocalPluginRoot)
	if err != nil {
		return PluginInstallResult{}, err
	}
	sourceDigest, err := computeDirectoryDigest(sourceRoot)
	if err != nil {
		return PluginInstallResult{}, err
	}
	scope, err := NormalizeScope(options.Scope)
	if err != nil {
		return PluginInstallResult{}, err
	}
	targetPath, err := s.store.PluginRoot(scope, manifest.ID)
	if err != nil {
		return PluginInstallResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.reserveInstallTargetPathLocked(targetPath, options.Force); err != nil {
		return PluginInstallResult{}, err
	}
	defer s.releaseInstallTargetPathReservationLocked(targetPath)

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginInstallResult{}, err
	}
	existingEntry := findDiscoveredPlugin(snapshot.Plugins, manifest.ID, scope)
	hadBackendBefore := existingEntry.PluginID != "" && existingEntry.HasBackend()

	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return PluginInstallResult{}, fmt.Errorf("create plugin target parent %s: %w", targetPath, err)
	}
	if err := s.ensureTargetPathAvailableLocked(targetPath, options.Force); err != nil {
		return PluginInstallResult{}, err
	}
	if targetExists(targetPath) {
		if err := s.backupExistingPluginLocked(manifest.ID, scope, targetPath); err != nil {
			return PluginInstallResult{}, err
		}
		if err := removePluginTarget(targetPath); err != nil {
			return PluginInstallResult{}, err
		}
	}
	if err := os.Symlink(sourceRoot, targetPath); err != nil {
		return PluginInstallResult{}, fmt.Errorf("activate linked plugin %s: %w", targetPath, err)
	}

	canonicalSourceKey := "local:" + sourceRoot
	if err := s.store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           manifest.ID,
		Scope:              scope,
		SourceSpec:         canonicalSourceKey,
		CanonicalSourceKey: canonicalSourceKey,
		SourceDigestSHA256: stringPtr(sourceDigest),
		Version:            manifest.Version,
	}); err != nil {
		return PluginInstallResult{}, err
	}
	if err := s.applyEnablementAfterInstallLocked(manifest.ID, scope, options.Enable); err != nil {
		return PluginInstallResult{}, err
	}
	delete(s.pendingRestartRemovedPlugin, manifest.ID)

	restartRequired := manifest.Backend != nil || hadBackendBefore
	if restartRequired {
		if err := s.addPendingRestartBackendIDLocked(manifest.ID); err != nil {
			return PluginInstallResult{}, err
		}
	} else if err := s.discardPendingRestartBackendIDLocked(manifest.ID); err != nil {
		return PluginInstallResult{}, err
	}

	snapshot, err = s.rescanLocked()
	if err != nil {
		return PluginInstallResult{}, err
	}
	entry := findDiscoveredPlugin(snapshot.Plugins, manifest.ID, scope)
	if entry.PluginID == "" {
		return PluginInstallResult{}, newServiceError(ServiceErrorCodeLinkFailed, "Linked plugin was not discovered: %s", manifest.ID)
	}

	return PluginInstallResult{
		PluginID:              entry.PluginID,
		Version:               entry.Version,
		SourceScope:           scope,
		SourceScopeLabel:      string(scope),
		SourcePath:            entry.SourcePath,
		CanonicalSourceKey:    entry.CanonicalSourceKey,
		SourceDigestSHA256:    cloneOptionalString(entry.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), entry.RequestedCapabilities...),
		TrustStatus:           PluginSourceTrustStatusUnverified,
		TrustWarning:          unverifiedSourceWarning,
		Components:            manifestComponents(manifest),
		State:                 entry.State,
		RestartRequired:       restartRequired,
	}, nil
}

func (s *Service) validateLocalPluginSource(rawRoot string) (string, PluginManifest, error) {
	root, err := statefs.NormalizePath(rawRoot, "")
	if err != nil {
		return "", PluginManifest{}, err
	}
	info, err := os.Stat(root)
	if err != nil {
		if os.IsNotExist(err) {
			return "", PluginManifest{}, newServiceError(ServiceErrorCodeSourceNotFound, "Plugin folder not found: %s", root)
		}
		return "", PluginManifest{}, fmt.Errorf("stat plugin folder %s: %w", root, err)
	}
	if !info.IsDir() {
		return "", PluginManifest{}, newServiceError(ServiceErrorCodeSourceNotFound, "Plugin folder not found: %s", root)
	}
	manifest, err := loadAuthoringManifest(filepath.Join(root, pluginManifestFileName))
	if err != nil {
		return "", PluginManifest{}, err
	}
	if err := validateManifestPathsForAuthoring(root, manifest); err != nil {
		return "", PluginManifest{}, err
	}
	if err := s.validateSettaVersionRange(manifest); err != nil {
		return "", PluginManifest{}, err
	}
	if err := validatePluginConfigSchemaFile(root, manifest); err != nil {
		return "", PluginManifest{}, err
	}
	return root, manifest, nil
}

func loadAuthoringManifest(manifestPath string) (PluginManifest, error) {
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return PluginManifest{}, newServiceError(ServiceErrorCodeSourceManifestNotFound, "Manifest not found: %s", manifestPath)
		}
		return PluginManifest{}, fmt.Errorf("read plugin manifest %s: %w", manifestPath, err)
	}

	decoder := json.NewDecoder(bytes.NewReader(content))
	var rawValue any
	if err := decoder.Decode(&rawValue); err != nil {
		return PluginManifest{}, newServiceError(ServiceErrorCodeManifestInvalid, "Invalid JSON in plugin manifest: %s", manifestPath)
	}
	if decoder.More() {
		return PluginManifest{}, newServiceError(ServiceErrorCodeManifestInvalid, "Invalid JSON in plugin manifest: %s", manifestPath)
	}

	rawManifest, ok := rawValue.(map[string]any)
	if !ok {
		return PluginManifest{}, newServiceError(ServiceErrorCodeManifestInvalid, "Plugin manifest failed schema validation in %s: manifest must be a JSON object", manifestPath)
	}
	if rawSchemaVersion, ok := rawManifest["schemaVersion"].(float64); ok && rawSchemaVersion == float64(int(rawSchemaVersion)) && int(rawSchemaVersion) != pluginManifestSchemaVersion {
		return PluginManifest{}, newServiceError(ServiceErrorCodeManifestUnsupported, "Unsupported plugin manifest schema version: %d", int(rawSchemaVersion))
	}
	if err := validateManifestCapabilities(rawManifest); err != nil {
		return PluginManifest{}, err
	}

	manifest, err := loadPluginManifestFile(manifestPath)
	if err != nil {
		switch {
		case errors.Is(err, ErrPluginManifestUnsupported):
			return PluginManifest{}, newServiceError(ServiceErrorCodeManifestUnsupported, "Unsupported plugin manifest schema version: %s", strings.TrimSpace(strings.TrimPrefix(err.Error(), ErrPluginManifestUnsupported.Error()+":")))
		case errors.Is(err, ErrPluginManifestInvalid):
			return PluginManifest{}, newServiceError(ServiceErrorCodeManifestInvalid, "Plugin manifest validation failed in %s: %s", manifestPath, err.Error())
		default:
			return PluginManifest{}, err
		}
	}
	return manifest, nil
}

func validateManifestCapabilities(rawManifest map[string]any) error {
	rawCapabilities, ok := rawManifest["capabilities"]
	if !ok || rawCapabilities == nil {
		return nil
	}
	capabilities, ok := rawCapabilities.([]any)
	if !ok {
		return newServiceError(ServiceErrorCodeManifestInvalid, "Manifest capabilities must be an array.")
	}
	seen := map[string]struct{}{}
	for _, rawCapability := range capabilities {
		capability, ok := rawCapability.(string)
		if !ok {
			return newServiceError(ServiceErrorCodeManifestInvalidCap, "Unknown capability in manifest: %v", rawCapability)
		}
		if _, ok := resolverKnownPluginCapabilities[capability]; !ok {
			return newServiceError(ServiceErrorCodeManifestInvalidCap, "Unknown capability in manifest: %q", capability)
		}
		if _, exists := seen[capability]; exists {
			return newServiceError(ServiceErrorCodeManifestDuplicateCap, "Duplicate capability in manifest: %q", capability)
		}
		seen[capability] = struct{}{}
	}
	return nil
}

func validateManifestPathsForAuthoring(pluginRoot string, manifest PluginManifest) error {
	if manifest.Backend != nil {
		path, err := resolveAuthoringPath(pluginRoot, manifest.Backend.Entrypoint, "Invalid backend entrypoint")
		if err != nil {
			return err
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			return newServiceError(ServiceErrorCodeManifestPathNotFound, "Plugin backend entrypoint not found: %s", path)
		}
	}
	if manifest.Frontend != nil {
		path, err := resolveAuthoringPath(pluginRoot, manifest.Frontend.Entrypoint, "Invalid frontend entrypoint")
		if err != nil {
			return err
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			return newServiceError(ServiceErrorCodeManifestPathNotFound, "Plugin frontend entrypoint not found: %s", path)
		}
		if strings.TrimSpace(manifest.Frontend.Style) != "" {
			stylePath, err := resolveAuthoringPath(pluginRoot, manifest.Frontend.Style, "Invalid frontend style path")
			if err != nil {
				return err
			}
			info, err := os.Stat(stylePath)
			if err != nil || !info.Mode().IsRegular() {
				return newServiceError(ServiceErrorCodeManifestPathNotFound, "Plugin frontend style not found: %s", stylePath)
			}
		}
	}
	if manifest.Content != nil {
		for label, rawPath := range map[string]string{
			"blueprints":        manifest.Content.BlueprintsDir,
			"project templates": manifest.Content.ProjectTemplatesDir,
			"prompts":           manifest.Content.PromptsDir,
		} {
			if strings.TrimSpace(rawPath) == "" {
				continue
			}
			dirPath, err := resolveAuthoringPath(pluginRoot, rawPath, fmt.Sprintf("Invalid content %s directory", label))
			if err != nil {
				return err
			}
			info, err := os.Stat(dirPath)
			if err != nil || !info.IsDir() {
				return newServiceError(ServiceErrorCodeManifestPathNotFound, "Plugin content %s directory not found: %s", label, dirPath)
			}
		}
	}
	if strings.TrimSpace(manifest.ConfigSchemaPath) != "" {
		schemaPath, err := resolveAuthoringPath(pluginRoot, manifest.ConfigSchemaPath, "Invalid configSchemaPath")
		if err != nil {
			return err
		}
		info, err := os.Stat(schemaPath)
		if err != nil || !info.Mode().IsRegular() {
			return newServiceError(ServiceErrorCodeManifestPathNotFound, "Plugin configSchemaPath not found: %s", schemaPath)
		}
	}
	return nil
}

func resolveAuthoringPath(pluginRoot string, relativePath string, messagePrefix string) (string, error) {
	resolvedPath, err := statefs.ResolveWithinRoot(pluginRoot, relativePath, messagePrefix)
	if err != nil {
		return "", newServiceError(ServiceErrorCodeManifestPathNotFound, "%s: %v", messagePrefix, err)
	}
	return resolvedPath, nil
}

func (s *Service) validateSettaVersionRange(manifest PluginManifest) error {
	specifiers, err := parseSpecifierSet(manifest.SettaVersionRange)
	if err != nil {
		return newServiceError(ServiceErrorCodeManifestInvalid, "Invalid settaVersionRange for plugin %s: %s", manifest.ID, manifest.SettaVersionRange)
	}
	currentVersion, err := parseVersion(s.settaVersion)
	if err != nil {
		return newServiceError(ServiceErrorCodeHostVersionInvalid, "Host Setta version is invalid: %s", s.settaVersion)
	}
	if !specifiers.Contains(currentVersion) {
		return newServiceError(ServiceErrorCodeManifestVersionMismatch, "Plugin %s requires Setta version %s, current version is %s", manifest.ID, manifest.SettaVersionRange, s.settaVersion)
	}
	return nil
}

func validatePluginConfigSchemaFile(pluginRoot string, manifest PluginManifest) error {
	if strings.TrimSpace(manifest.ConfigSchemaPath) == "" {
		return nil
	}
	schemaPath, err := resolveAuthoringPath(pluginRoot, manifest.ConfigSchemaPath, "Invalid configSchemaPath")
	if err != nil {
		return err
	}
	content, err := os.ReadFile(schemaPath)
	if err != nil {
		return fmt.Errorf("read plugin config schema %s: %w", schemaPath, err)
	}
	var payload any
	if err := json.Unmarshal(content, &payload); err != nil {
		return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid config schema JSON at: %s", schemaPath)
	}
	if _, ok := payload.(map[string]any); !ok {
		return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Config schema must be a JSON object: %s", schemaPath)
	}
	return nil
}

func (s *Service) validateMetadataIdentity(pluginRoot string, manifest PluginManifest) error {
	packageName, packageVersion := readPackageMetadataOptional(pluginRoot)
	if packageName == "" || packageVersion == "" {
		pyprojectName, pyprojectVersion := readPyprojectMetadataOptional(pluginRoot)
		if packageName == "" {
			packageName = pyprojectName
		}
		if packageVersion == "" {
			packageVersion = pyprojectVersion
		}
	}
	if packageName == "" && packageVersion == "" {
		return nil
	}
	if packageName != "" && normalizeIdentityValue(packageName) != normalizeIdentityValue(manifest.ID) {
		return newServiceError(ServiceErrorCodeSourceIdentityMismatch, "Package name %q does not match manifest id %q in %s", packageName, manifest.ID, pluginRoot)
	}
	if packageVersion != "" && packageVersion != manifest.Version {
		return newServiceError(ServiceErrorCodeSourceVersionMismatch, "Package version %q does not match manifest version %q in %s", packageVersion, manifest.Version, pluginRoot)
	}
	return nil
}

func readPyprojectMetadataOptional(pluginRoot string) (string, string) {
	pyprojectPath := filepath.Join(pluginRoot, "pyproject.toml")
	content, err := os.ReadFile(pyprojectPath)
	if err != nil {
		return "", ""
	}
	var payload struct {
		Project struct {
			Name    string `toml:"name"`
			Version string `toml:"version"`
		} `toml:"project"`
	}
	if err := toml.Unmarshal(content, &payload); err != nil {
		return "", ""
	}
	return strings.TrimSpace(payload.Project.Name), strings.TrimSpace(payload.Project.Version)
}

func readPackageMetadataOptional(pluginRoot string) (string, string) {
	metadataPath := ""
	walkErr := filepath.WalkDir(pluginRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".dist-info"+string(filepath.Separator)+"METADATA") {
			metadataPath = path
			return fs.SkipAll
		}
		return nil
	})
	if walkErr != nil || metadataPath == "" {
		return "", ""
	}
	content, err := os.ReadFile(metadataPath)
	if err != nil {
		return "", ""
	}
	packageName := ""
	packageVersion := ""
	for _, line := range strings.Split(string(content), "\n") {
		switch {
		case strings.HasPrefix(line, "Name:") && packageName == "":
			packageName = strings.TrimSpace(strings.TrimPrefix(line, "Name:"))
		case strings.HasPrefix(line, "Version:") && packageVersion == "":
			packageVersion = strings.TrimSpace(strings.TrimPrefix(line, "Version:"))
		}
		if packageName != "" && packageVersion != "" {
			break
		}
	}
	return packageName, packageVersion
}

func normalizeIdentityValue(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	normalized := make([]rune, 0, len(value))
	for _, char := range value {
		switch {
		case char >= 'a' && char <= 'z':
			normalized = append(normalized, char)
		case char >= '0' && char <= '9':
			normalized = append(normalized, char)
		case char == '-', char == '_', char == '.':
			normalized = append(normalized, '-')
		default:
			normalized = append(normalized, '-')
		}
	}
	normalizedValue := strings.Trim(string(normalized), "-")
	for strings.Contains(normalizedValue, "--") {
		normalizedValue = strings.ReplaceAll(normalizedValue, "--", "-")
	}
	return normalizedValue
}

func normalizeAndValidateInitPluginID(raw string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		return "", newServiceError(ServiceErrorCodeInitInvalidID, "Missing plugin id.")
	}
	normalizedID, err := NormalizePluginID(trimmed)
	if err != nil {
		return "", newServiceError(ServiceErrorCodeInitInvalidID, "Invalid plugin id: %s", strings.TrimSpace(strings.TrimPrefix(err.Error(), ErrPluginIDInvalid.Error()+":")))
	}
	return normalizedID, nil
}

func normalizeInitTemplate(raw string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		return "full", nil
	}
	switch trimmed {
	case "frontend", "backend", "full", "content":
		return trimmed, nil
	default:
		return "", newServiceError(ServiceErrorCodeSourceInvalid, "Invalid plugin init template: %q", raw)
	}
}

func resolveInitTemplateRoot(workspaceRoot string, pluginID string, outDir string) (string, error) {
	if strings.TrimSpace(outDir) == "" {
		return filepath.Join(workspaceRoot, pluginID), nil
	}
	resolvedOutDir, err := statefs.NormalizePath(outDir, "")
	if err != nil {
		return "", err
	}
	return filepath.Join(resolvedOutDir, pluginID), nil
}

func scaffoldFrontendTemplate(root string) error {
	frontendDistDir := filepath.Join(root, "frontend", "dist")
	if err := os.MkdirAll(frontendDistDir, 0o755); err != nil {
		return fmt.Errorf("create frontend template directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDistDir, "index.js"), []byte("export const apiVersion = 1;\n\nexport function register(host) {\n  void host;\n}\n"), 0o644); err != nil {
		return fmt.Errorf("write frontend entrypoint: %w", err)
	}
	if err := os.WriteFile(filepath.Join(frontendDistDir, "index.css"), []byte("/* plugin styles */\n"), 0o644); err != nil {
		return fmt.Errorf("write frontend style: %w", err)
	}
	return nil
}

func scaffoldBackendTemplate(root string, pluginID string) error {
	backendDir := filepath.Join(root, "backend")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		return fmt.Errorf("create backend template directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(backendDir, "go.mod"), []byte(buildInitTemplateBackendGoMod(pluginID)), 0o644); err != nil {
		return fmt.Errorf("write backend go.mod: %w", err)
	}
	if err := os.WriteFile(filepath.Join(backendDir, "main.go"), []byte(initTemplateBackendMainGo), 0o644); err != nil {
		return fmt.Errorf("write backend main.go: %w", err)
	}
	return nil
}

func scaffoldContentTemplate(root string) error {
	blueprintsDir := filepath.Join(root, "content", "blueprints")
	templatesDir := filepath.Join(root, "content", "project_templates")
	promptsDir := filepath.Join(root, "content", "prompts")
	for _, dir := range []string{blueprintsDir, templatesDir, promptsDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create content template directory %s: %w", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(blueprintsDir, "starter-blueprint.json"), []byte("{\n  \"schemaVersion\": 1,\n  \"name\": \"Starter Blueprint\",\n  \"description\": \"Replace with your blueprint payload.\",\n  \"data\": {\n    \"project\": {},\n    \"sectionVariantMap\": {}\n  }\n}\n"), 0o644); err != nil {
		return fmt.Errorf("write starter blueprint: %w", err)
	}
	if err := os.WriteFile(filepath.Join(templatesDir, "starter-template.json"), []byte("{\n  \"schemaVersion\": 1,\n  \"name\": \"Starter Template\",\n  \"description\": \"Replace with your project template payload.\",\n  \"project\": {}\n}\n"), 0o644); err != nil {
		return fmt.Errorf("write starter template: %w", err)
	}
	if err := os.WriteFile(filepath.Join(promptsDir, "starter-prompt.md"), []byte("Replace this prompt template with your own content.\n"), 0o644); err != nil {
		return fmt.Errorf("write starter prompt: %w", err)
	}
	return nil
}

func buildInitTemplatePyproject(pluginID string, manifest PluginManifest) string {
	var builder strings.Builder
	builder.WriteString("[build-system]\n" +
		"requires = [\"setuptools>=68\", \"wheel\"]\n" +
		"build-backend = \"setuptools.build_meta\"\n\n" +
		"[project]\n" +
		fmt.Sprintf("name = %q\n", pluginID) +
		"version = \"0.1.0\"\n" +
		"description = \"Setta plugin\"\n" +
		"requires-python = \">=3.12\"\n" +
		"dependencies = []\n\n" +
		"[tool.setuptools]\n" +
		"py-modules = []\n\n" +
		"[tool.setuptools.data-files]\n" +
		"\".\" = [\"setta.plugin.json\", \"README.md\"]\n")
	if manifest.Backend != nil {
		builder.WriteString("\"backend\" = [\"backend/*\"]\n")
	}
	if manifest.Frontend != nil {
		builder.WriteString("\"frontend/dist\" = [\"frontend/dist/*\"]\n")
	}
	if manifest.Content != nil {
		builder.WriteString("\"content/blueprints\" = [\"content/blueprints/*\"]\n")
		builder.WriteString("\"content/project_templates\" = [\"content/project_templates/*\"]\n")
		builder.WriteString("\"content/prompts\" = [\"content/prompts/*\"]\n")
	}
	return builder.String()
}

const initTemplateWorkflow = "name: publish-plugin\n\n" +
	"on:\n" +
	"  workflow_dispatch:\n" +
	"  push:\n" +
	"    tags:\n" +
	"      - \"v*\"\n\n" +
	"jobs:\n" +
	"  build-and-publish:\n" +
	"    runs-on: ubuntu-latest\n" +
	"    steps:\n" +
	"      - uses: actions/checkout@v4\n" +
	"      - uses: actions/setup-python@v5\n" +
	"        with:\n" +
	"          python-version: \"3.12\"\n" +
	"      - uses: actions/setup-go@v5\n" +
	"        if: ${{ hashFiles('backend/go.mod') != '' }}\n" +
	"        with:\n" +
	"          go-version: \"1.26.1\"\n" +
	"      - run: python -m pip install --upgrade build twine setta\n" +
	"      - run: setta plugins validate .\n" +
	"      - run: |\n" +
	"          if [ -f backend/go.mod ]; then\n" +
	"            (cd backend && go build ./...)\n" +
	"          fi\n" +
	"      - run: python -m build\n" +
	"      - run: python -m twine check dist/*\n" +
	"      # Configure publish credentials/secrets for your registry.\n"

func buildInitTemplateREADME(pluginID string, manifest PluginManifest) string {
	var builder strings.Builder
	builder.WriteString("# Setta Plugin\n\n" +
		"## Validate\n\n" +
		"```bash\n" +
		"setta plugins validate .\n" +
		"```\n\n")
	if manifest.Backend != nil {
		builder.WriteString("## Build backend\n\n" +
			"```bash\n" +
			"(cd backend && go build ./...)\n" +
			"```\n\n")
	}
	builder.WriteString("## Build package\n\n" +
		"```bash\n" +
		"python -m build\n" +
		"```\n\n" +
		"## Publish\n\n" +
		"1. Push a git tag (for example `v0.1.0`) to trigger `.github/workflows/release.yml`.\n" +
		"2. Or run manual publish using your package registry credentials.\n\n" +
		"## Install\n\n" +
		"```bash\n" +
		"setta plugins install github:OWNER/REPO#v0.1.0\n" +
		fmt.Sprintf("setta plugins install pypi:%s==0.1.0\n", pluginID) +
		"```\n")
	return builder.String()
}

func buildInitTemplateBackendGoMod(pluginID string) string {
	return "module example.com/" + pluginID + "/backend\n\n" +
		"go 1.26.0\n"
}

const initTemplateBackendMainGo = "package main\n\n" +
	"import (\n" +
	"  \"encoding/json\"\n" +
	"  \"fmt\"\n" +
	"  \"os\"\n" +
	")\n\n" +
	"const backendProbeArg = \"--setta-plugin-backend-probe\"\n\n" +
	"func main() {\n" +
	"  if len(os.Args) == 2 && os.Args[1] == backendProbeArg {\n" +
	"    payload := map[string]any{\n" +
	"      \"schemaVersion\": 1,\n" +
	"      \"routes\": []map[string]any{},\n" +
	"      \"staticDirs\": []map[string]any{},\n" +
	"      \"listenerEndpoints\": []map[string]any{},\n" +
	"    }\n" +
	"    if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {\n" +
	"      _, _ = fmt.Fprintf(os.Stderr, \"encode backend probe: %v\\n\", err)\n" +
	"      os.Exit(1)\n" +
	"    }\n" +
	"    return\n" +
	"  }\n" +
	"}\n"
