package plugins

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
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

type initTemplateComponent string

const (
	initTemplateComponentBackend  initTemplateComponent = "backend"
	initTemplateComponentFrontend initTemplateComponent = "frontend"
	initTemplateComponentContent  initTemplateComponent = "content"
)

var initTemplateDefinitions = map[string][]initTemplateComponent{
	"backend":  {initTemplateComponentBackend},
	"frontend": {initTemplateComponentFrontend},
	"content":  {initTemplateComponentContent},
	"full": {
		initTemplateComponentBackend,
		initTemplateComponentFrontend,
		initTemplateComponentContent,
	},
}

type initTemplateFile struct {
	relativePath string
	contents     []byte
	description  string
}

type preparedLinkSource struct {
	sourceRoot   string
	manifest     PluginManifest
	sourceDigest string
	scope        PluginScope
	targetPath   string
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
	if err := ensureInitTemplateRoot(root); err != nil {
		return "", err
	}

	manifest, err := scaffoldInitTemplate(root, normalizedID, template)
	if err != nil {
		return "", err
	}
	if err := writeInitTemplateFiles(root, normalizedID, manifest); err != nil {
		return "", err
	}
	return root, nil
}

func ensureInitTemplateRoot(root string) error {
	if _, err := os.Stat(root); err == nil {
		return newServiceError(ServiceErrorCodeInitTargetExists, "Plugin folder already exists: %s", root)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat plugin template root %s: %w", root, err)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create plugin template root %s: %w", root, err)
	}
	return nil
}

func scaffoldInitTemplate(root string, pluginID string, template string) (PluginManifest, error) {
	components, ok := initTemplateDefinitions[template]
	if !ok {
		return PluginManifest{}, newServiceError(ServiceErrorCodeSourceInvalid, "Invalid plugin init template: %q", template)
	}

	manifest := PluginManifest{
		SchemaVersion:     pluginManifestSchemaVersion,
		ID:                pluginID,
		Name:              pluginID,
		Version:           "0.1.0",
		SettaVersionRange: ">=0.0.0",
		EnabledByDefault:  false,
		Capabilities:      []string{},
	}
	for _, component := range components {
		if err := scaffoldInitTemplateComponent(root, pluginID, component); err != nil {
			return PluginManifest{}, err
		}
		addInitTemplateComponentToManifest(&manifest, component)
	}
	return manifest, nil
}

func scaffoldInitTemplateComponent(root string, pluginID string, component initTemplateComponent) error {
	switch component {
	case initTemplateComponentBackend:
		return scaffoldBackendTemplate(root, pluginID)
	case initTemplateComponentFrontend:
		return scaffoldFrontendTemplate(root)
	case initTemplateComponentContent:
		return scaffoldContentTemplate(root)
	default:
		return newServiceError(ServiceErrorCodeSourceInvalid, "Invalid plugin init component: %q", component)
	}
}

func addInitTemplateComponentToManifest(manifest *PluginManifest, component initTemplateComponent) {
	switch component {
	case initTemplateComponentBackend:
		manifest.Backend = &PluginBackendManifest{
			Entrypoint: "backend/main.go",
		}
	case initTemplateComponentFrontend:
		manifest.Frontend = &PluginFrontendManifest{
			Entrypoint: "frontend/dist/index.js",
			Style:      "frontend/dist/index.css",
		}
	case initTemplateComponentContent:
		manifest.Content = &PluginContentManifest{
			BlueprintsDir:       "content/blueprints",
			ProjectTemplatesDir: "content/project_templates",
			PromptsDir:          "content/prompts",
		}
	}
}

func writeInitTemplateFiles(root string, pluginID string, manifest PluginManifest) error {
	manifestPayload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal plugin manifest: %w", err)
	}
	files := []initTemplateFile{
		{
			relativePath: pluginManifestFileName,
			contents:     manifestPayload,
			description:  "plugin manifest",
		},
		{
			relativePath: "pyproject.toml",
			contents:     []byte(buildInitTemplatePyproject(pluginID, manifest)),
			description:  "pyproject.toml",
		},
		{
			relativePath: filepath.Join(".github", "workflows", "release.yml"),
			contents:     []byte(initTemplateWorkflow),
			description:  "release workflow",
		},
		{
			relativePath: "README.md",
			contents:     []byte(buildInitTemplateREADME(pluginID, manifest)),
			description:  "plugin README",
		},
	}
	for _, file := range files {
		if err := writeInitTemplateFile(root, file); err != nil {
			return err
		}
	}
	return nil
}

func writeInitTemplateFile(root string, file initTemplateFile) error {
	fullPath := filepath.Join(root, file.relativePath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return fmt.Errorf("create parent directory for %s: %w", file.description, err)
	}
	if err := os.WriteFile(fullPath, file.contents, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", file.description, err)
	}
	return nil
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

func (s *Service) Link(options LinkOptions) (PluginInstallResponse, error) {
	if s == nil {
		return PluginInstallResponse{}, ErrWorkspaceRootRequired
	}

	prepared, err := s.prepareLinkSource(options)
	if err != nil {
		return PluginInstallResponse{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.linkPreparedSourceLocked(prepared, options.Enable, options.Force)
}

func (s *Service) prepareLinkSource(options LinkOptions) (preparedLinkSource, error) {
	sourceRoot, manifest, err := s.validateLocalPluginSource(options.LocalPluginRoot)
	if err != nil {
		return preparedLinkSource{}, err
	}
	sourceDigest, err := computeDirectoryDigest(sourceRoot)
	if err != nil {
		return preparedLinkSource{}, err
	}
	scope, err := NormalizeScope(options.Scope)
	if err != nil {
		return preparedLinkSource{}, err
	}
	targetPath, err := s.store.PluginRoot(scope, manifest.ID)
	if err != nil {
		return preparedLinkSource{}, err
	}
	return preparedLinkSource{
		sourceRoot:   sourceRoot,
		manifest:     manifest,
		sourceDigest: sourceDigest,
		scope:        scope,
		targetPath:   targetPath,
	}, nil
}

func (s *Service) linkPreparedSourceLocked(prepared preparedLinkSource, enable bool, force bool) (PluginInstallResponse, error) {
	if err := s.reserveInstallTargetPathLocked(prepared.targetPath, force); err != nil {
		return PluginInstallResponse{}, err
	}
	defer s.releaseInstallTargetPathReservationLocked(prepared.targetPath)

	hadBackendBefore, hadLanguageServerOnlyBefore, err := s.prepareLinkTargetLocked(prepared, force)
	if err != nil {
		return PluginInstallResponse{}, err
	}

	if err := os.Symlink(prepared.sourceRoot, prepared.targetPath); err != nil {
		return PluginInstallResponse{}, fmt.Errorf("activate linked plugin %s: %w", prepared.targetPath, err)
	}
	if err := s.recordLinkedInstallLocked(prepared, enable); err != nil {
		return PluginInstallResponse{}, err
	}
	restartRequired, err := s.updateLinkRestartStateLocked(
		prepared.manifest,
		prepared.manifest.ID,
		prepared.manifest.Backend != nil || hadBackendBefore,
		hadLanguageServerOnlyBefore,
	)
	if err != nil {
		return PluginInstallResponse{}, err
	}

	entry, err := s.rescanLinkedEntryLocked(prepared.manifest.ID, prepared.scope)
	if err != nil {
		return PluginInstallResponse{}, err
	}
	return PluginInstallResponse{
		PluginID:              entry.PluginID,
		Version:               entry.Version,
		SourceScope:           prepared.scope,
		SourceScopeLabel:      string(prepared.scope),
		SourcePath:            entry.SourcePath,
		CanonicalSourceKey:    entry.CanonicalSourceKey,
		SourceDigestSHA256:    cloneOptionalString(entry.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), entry.RequestedCapabilities...),
		TrustStatus:           PluginSourceTrustStatusUnverified,
		TrustWarning:          unverifiedSourceWarning,
		Components:            manifestComponents(prepared.manifest),
		State:                 entry.State,
		RestartRequired:       restartRequired,
	}, nil
}

func (s *Service) prepareLinkTargetLocked(prepared preparedLinkSource, force bool) (bool, bool, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return false, false, err
	}
	existingEntry := findDiscoveredPlugin(snapshot.Plugins, prepared.manifest.ID, prepared.scope)
	hadBackendBefore := existingEntry.PluginID != "" && existingEntry.HasBackend()
	hadLanguageServerOnlyBefore := entryHasLanguageServerOnlyBackendRuntime(existingEntry)

	if err := os.MkdirAll(filepath.Dir(prepared.targetPath), 0o755); err != nil {
		return false, false, fmt.Errorf("create plugin target parent %s: %w", prepared.targetPath, err)
	}
	if err := s.ensureTargetPathAvailableLocked(prepared.targetPath, force); err != nil {
		return false, false, err
	}
	if !targetExists(prepared.targetPath) {
		return hadBackendBefore, hadLanguageServerOnlyBefore, nil
	}
	if err := s.backupExistingPluginLocked(prepared.manifest.ID, prepared.scope, prepared.targetPath); err != nil {
		return false, false, err
	}
	if err := removePluginTarget(prepared.targetPath); err != nil {
		return false, false, err
	}
	return hadBackendBefore, hadLanguageServerOnlyBefore, nil
}

func (s *Service) recordLinkedInstallLocked(prepared preparedLinkSource, enable bool) error {
	canonicalSourceKey := "local:" + prepared.sourceRoot
	if err := s.store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           prepared.manifest.ID,
		Scope:              prepared.scope,
		SourceSpec:         canonicalSourceKey,
		CanonicalSourceKey: canonicalSourceKey,
		SourceDigestSHA256: stringPtr(prepared.sourceDigest),
		Version:            prepared.manifest.Version,
	}); err != nil {
		return err
	}
	if err := s.applyEnablementAfterInstallLocked(prepared.manifest.ID, prepared.scope, enable); err != nil {
		return err
	}
	delete(s.pendingRestartRemovedPlugin, prepared.manifest.ID)
	return nil
}

func (s *Service) updateLinkRestartStateLocked(
	manifest PluginManifest,
	pluginID string,
	restartRequired bool,
	hadLanguageServerOnlyBefore bool,
) (bool, error) {
	if restartRequired {
		languageServerOnly := s.pendingRestartLanguageServerOnlyForManifest(&manifest, hadLanguageServerOnlyBefore)
		if err := s.addPendingRestartBackendIDLocked(pluginID, languageServerOnly); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := s.discardPendingRestartBackendIDLocked(pluginID); err != nil {
		return false, err
	}
	return false, nil
}

func (s *Service) rescanLinkedEntryLocked(pluginID string, scope PluginScope) (DiscoveredPlugin, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return DiscoveredPlugin{}, err
	}
	entry := findDiscoveredPlugin(snapshot.Plugins, pluginID, scope)
	if entry.PluginID == "" {
		return DiscoveredPlugin{}, newServiceError(ServiceErrorCodeLinkFailed, "Linked plugin was not discovered: %s", pluginID)
	}
	return entry, nil
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
	if err := ensureRuntimeManagedPluginFrontendAssets(root, manifest); err != nil {
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

	rawManifest, err := decodeRawAuthoringManifest(manifestPath, content)
	if err != nil {
		return PluginManifest{}, err
	}
	if err := validateManifestCapabilities(rawManifest); err != nil {
		return PluginManifest{}, err
	}

	manifest, err := loadPluginManifestFile(manifestPath)
	if err != nil {
		return PluginManifest{}, normalizeAuthoringManifestLoadError(manifestPath, err)
	}
	return manifest, nil
}

func decodeRawAuthoringManifest(manifestPath string, content []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	var rawValue any
	if err := decoder.Decode(&rawValue); err != nil || decoder.More() {
		return nil, newServiceError(ServiceErrorCodeManifestInvalid, "Invalid JSON in plugin manifest: %s", manifestPath)
	}
	rawManifest, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newServiceError(ServiceErrorCodeManifestInvalid, "Plugin manifest failed schema validation in %s: manifest must be a JSON object", manifestPath)
	}
	if err := validateAuthoringManifestSchemaVersion(rawManifest); err != nil {
		return nil, err
	}
	return rawManifest, nil
}

func validateAuthoringManifestSchemaVersion(rawManifest map[string]any) error {
	rawSchemaVersion, ok := rawManifest["schemaVersion"].(float64)
	if !ok || rawSchemaVersion != float64(int(rawSchemaVersion)) || int(rawSchemaVersion) == pluginManifestSchemaVersion {
		return nil
	}
	return newServiceError(ServiceErrorCodeManifestUnsupported, "Unsupported plugin manifest schema version: %d", int(rawSchemaVersion))
}

func normalizeAuthoringManifestLoadError(manifestPath string, err error) error {
	switch {
	case errors.Is(err, ErrPluginManifestUnsupported):
		return newServiceError(
			ServiceErrorCodeManifestUnsupported,
			"Unsupported plugin manifest schema version: %s",
			strings.TrimSpace(strings.TrimPrefix(err.Error(), ErrPluginManifestUnsupported.Error()+":")),
		)
	case errors.Is(err, ErrPluginManifestInvalid):
		return newServiceError(ServiceErrorCodeManifestInvalid, "Plugin manifest validation failed in %s: %s", manifestPath, err.Error())
	default:
		return err
	}
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
	if err := validateBackendManifestPathsForAuthoring(pluginRoot, manifest.Backend); err != nil {
		return err
	}
	if err := validateFrontendManifestPathsForAuthoring(pluginRoot, manifest.Frontend); err != nil {
		return err
	}
	if err := validateContentManifestPathsForAuthoring(pluginRoot, manifest.Content); err != nil {
		return err
	}
	return validateConfigSchemaPathForAuthoring(pluginRoot, manifest.ConfigSchemaPath)
}

func validateBackendManifestPathsForAuthoring(pluginRoot string, backend *PluginBackendManifest) error {
	if backend == nil {
		return nil
	}
	return validateAuthoringRegularFile(
		pluginRoot,
		backend.Entrypoint,
		"Invalid backend entrypoint",
		"Plugin backend entrypoint not found: %s",
	)
}

func validateFrontendManifestPathsForAuthoring(pluginRoot string, frontend *PluginFrontendManifest) error {
	if frontend == nil {
		return nil
	}
	if err := validateAuthoringRegularFile(
		pluginRoot,
		frontend.Entrypoint,
		"Invalid frontend entrypoint",
		"Plugin frontend entrypoint not found: %s",
	); err != nil {
		return err
	}
	return validateAuthoringOptionalRegularFile(
		pluginRoot,
		frontend.Style,
		"Invalid frontend style path",
		"Plugin frontend style not found: %s",
	)
}

func validateContentManifestPathsForAuthoring(pluginRoot string, content *PluginContentManifest) error {
	if content == nil {
		return nil
	}
	requirements := []struct {
		label string
		path  string
	}{
		{label: "blueprints", path: content.BlueprintsDir},
		{label: "project templates", path: content.ProjectTemplatesDir},
		{label: "prompts", path: content.PromptsDir},
	}
	for _, requirement := range requirements {
		if err := validateAuthoringOptionalDirectory(
			pluginRoot,
			requirement.path,
			fmt.Sprintf("Invalid content %s directory", requirement.label),
			fmt.Sprintf("Plugin content %s directory not found: %%s", requirement.label),
		); err != nil {
			return err
		}
	}
	return nil
}

func validateConfigSchemaPathForAuthoring(pluginRoot string, configSchemaPath string) error {
	return validateAuthoringOptionalRegularFile(
		pluginRoot,
		configSchemaPath,
		"Invalid configSchemaPath",
		"Plugin configSchemaPath not found: %s",
	)
}

func validateAuthoringOptionalRegularFile(pluginRoot string, relativePath string, invalidMessage string, notFoundFormat string) error {
	if strings.TrimSpace(relativePath) == "" {
		return nil
	}
	return validateAuthoringRegularFile(pluginRoot, relativePath, invalidMessage, notFoundFormat)
}

func validateAuthoringRegularFile(pluginRoot string, relativePath string, invalidMessage string, notFoundFormat string) error {
	path, err := resolveAuthoringPath(pluginRoot, relativePath, invalidMessage)
	if err != nil {
		return err
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return newServiceError(ServiceErrorCodeManifestPathNotFound, notFoundFormat, path)
	}
	return nil
}

func validateAuthoringOptionalDirectory(pluginRoot string, relativePath string, invalidMessage string, notFoundFormat string) error {
	if strings.TrimSpace(relativePath) == "" {
		return nil
	}
	path, err := resolveAuthoringPath(pluginRoot, relativePath, invalidMessage)
	if err != nil {
		return err
	}
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return newServiceError(ServiceErrorCodeManifestPathNotFound, notFoundFormat, path)
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
	document, ok, err := loadPluginConfigSchemaAuthoringDocument(pluginRoot, manifest)
	if err == nil || !ok {
		return err
	}
	return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid config schema JSON at: %s", document.Path)
}

func (s *Service) validateMetadataIdentity(pluginRoot string, manifest PluginManifest) error {
	packageName, packageVersion := readPackageMetadataOptional(pluginRoot, manifest.ID)
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

func readPackageMetadataOptional(pluginRoot string, expectedPackageID string) (string, string) {
	metadataPaths := findPackageMetadataPaths(pluginRoot)
	if len(metadataPaths) == 0 {
		return "", ""
	}
	expectedNormalized := normalizeIdentityValue(expectedPackageID)
	fallbackName := ""
	fallbackVersion := ""
	for _, metadataPath := range metadataPaths {
		content, err := os.ReadFile(metadataPath)
		if err != nil {
			continue
		}
		packageName, packageVersion := parsePackageMetadataNameAndVersion(string(content))
		if packageName == "" && packageVersion == "" {
			continue
		}
		if fallbackName == "" && fallbackVersion == "" {
			fallbackName = packageName
			fallbackVersion = packageVersion
		}
		if expectedNormalized != "" && normalizeIdentityValue(packageName) == expectedNormalized {
			return packageName, packageVersion
		}
	}
	if expectedNormalized != "" {
		return "", ""
	}
	return fallbackName, fallbackVersion
}

func findPackageMetadataPaths(pluginRoot string) []string {
	metadataPaths := make([]string, 0, 1)
	if err := filepath.WalkDir(pluginRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".dist-info"+string(filepath.Separator)+"METADATA") {
			metadataPaths = append(metadataPaths, path)
		}
		return nil
	}); err != nil {
		return nil
	}
	return metadataPaths
}

func parsePackageMetadataNameAndVersion(content string) (string, string) {
	packageName := ""
	packageVersion := ""
	for _, line := range strings.Split(content, "\n") {
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
	pluginRoot := strings.TrimSpace(pluginID)
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
		fmt.Sprintf("%q = [\"setta.plugin.json\", \"README.md\"]\n", pluginRoot))
	if manifest.Backend != nil {
		builder.WriteString(fmt.Sprintf("%q = [\"backend/*\"]\n", pluginRoot+"/backend"))
	}
	if manifest.Frontend != nil {
		builder.WriteString(fmt.Sprintf("%q = [\"frontend/dist/*\"]\n", pluginRoot+"/frontend/dist"))
	}
	if manifest.Content != nil {
		builder.WriteString(fmt.Sprintf("%q = [\"content/blueprints/*\"]\n", pluginRoot+"/content/blueprints"))
		builder.WriteString(fmt.Sprintf("%q = [\"content/project_templates/*\"]\n", pluginRoot+"/content/project_templates"))
		builder.WriteString(fmt.Sprintf("%q = [\"content/prompts/*\"]\n", pluginRoot+"/content/prompts"))
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
	"  \"strings\"\n" +
	")\n\n" +
	"const (\n" +
	"  backendProbeArg = \"--setta-plugin-backend-probe\"\n" +
	"  backendRuntimeArg = \"--setta-plugin-backend-runtime\"\n" +
	")\n\n" +
	"type runtimeRequest struct {\n" +
	"  SchemaVersion int `json:\"schemaVersion\"`\n" +
	"  Kind string `json:\"kind\"`\n" +
	"}\n\n" +
	"type runtimeResponse struct {\n" +
	"  SchemaVersion int `json:\"schemaVersion\"`\n" +
	"  ListenerEndpoint map[string]any `json:\"listenerEndpoint,omitempty\"`\n" +
	"  HTTP map[string]any `json:\"http,omitempty\"`\n" +
	"}\n\n" +
	"func main() {\n" +
	"  if len(os.Args) != 2 {\n" +
	"    return\n" +
	"  }\n" +
	"  switch os.Args[1] {\n" +
	"  case backendProbeArg:\n" +
	"    payload := map[string]any{\n" +
	"      \"schemaVersion\": 1,\n" +
	"      \"codegenTargets\": []map[string]any{},\n" +
	"      \"routes\": []map[string]any{},\n" +
	"      \"staticDirs\": []map[string]any{},\n" +
	"      \"listenerEndpoints\": []map[string]any{},\n" +
	"    }\n" +
	"    if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {\n" +
	"      _, _ = fmt.Fprintf(os.Stderr, \"encode backend probe: %v\\n\", err)\n" +
	"      os.Exit(1)\n" +
	"    }\n" +
	"  case backendRuntimeArg:\n" +
	"    var request runtimeRequest\n" +
	"    decoder := json.NewDecoder(os.Stdin)\n" +
	"    decoder.DisallowUnknownFields()\n" +
	"    if err := decoder.Decode(&request); err != nil {\n" +
	"      _, _ = fmt.Fprintf(os.Stderr, \"decode backend runtime request: %v\\n\", err)\n" +
	"      os.Exit(1)\n" +
	"    }\n" +
	"    response := runtimeResponse{SchemaVersion: 1}\n" +
	"    switch strings.TrimSpace(request.Kind) {\n" +
	"    case \"http\":\n" +
	"      response.HTTP = map[string]any{\"statusCode\": 404, \"headers\": map[string][]string{}}\n" +
	"    case \"listener_endpoint\":\n" +
	"      response.ListenerEndpoint = map[string]any{\"result\": nil}\n" +
	"    default:\n" +
	"      _, _ = fmt.Fprintf(os.Stderr, \"unsupported backend runtime kind %q\\n\", request.Kind)\n" +
	"      os.Exit(1)\n" +
	"    }\n" +
	"    if err := json.NewEncoder(os.Stdout).Encode(response); err != nil {\n" +
	"      _, _ = fmt.Fprintf(os.Stderr, \"encode backend runtime response: %v\\n\", err)\n" +
	"      os.Exit(1)\n" +
	"    }\n" +
	"  }\n" +
	"}\n"
