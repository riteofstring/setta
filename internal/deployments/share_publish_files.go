package deployments

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	toml "github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"

	"setta/internal/statefs"
)

func (p *SharePublisher) copyListenerEntrypoint(source string, deploymentRoot string, enabled bool) (*ListenerConfig, error) {
	if source == "" {
		return nil, nil
	}
	sourcePath, err := p.resolveSourcePath(source)
	if err != nil {
		return nil, err
	}
	targetPath := filepath.Join(deploymentRoot, "listener", "app.py")
	if err := copyFile(sourcePath, targetPath); err != nil {
		return nil, err
	}
	return &ListenerConfig{
		Entrypoint: filepath.ToSlash(filepath.Join("listener", "app.py")),
		Enabled:    enabled,
	}, nil
}

func (p *SharePublisher) copyArtifactPath(source string, deploymentRoot string, pathMap map[string]string) (string, error) {
	return p.copyFileIntoDeployment(source, deploymentRoot, pathMap, p.artifactsRoot, filepath.Join(deploymentRoot, "artifacts"), false)
}

func (p *SharePublisher) copyCodePath(source string, deploymentRoot string, pathMap map[string]string) (string, error) {
	return p.copyFileIntoDeployment(source, deploymentRoot, pathMap, p.codeRoot, filepath.Join(deploymentRoot, "code"), false)
}

func (p *SharePublisher) rebaseJSONSourcePath(source string, deploymentRoot string, pathMap map[string]string) (string, error) {
	trimmedSource := strings.TrimSpace(source)
	if trimmedSource == "" {
		return "", nil
	}
	if existing, ok := pathMap[trimmedSource]; ok {
		return existing, nil
	}

	sourcePath, err := p.resolveSourcePath(trimmedSource)
	if err != nil {
		return "", err
	}
	targetPath, err := p.targetPathForDeploymentFile(sourcePath, filepath.Join(deploymentRoot, "json_sources"), p.jsonSourcesRoot, true)
	if err != nil {
		return "", err
	}
	relative := deploymentRelativePath(targetPath, deploymentRoot)
	pathMap[trimmedSource] = relative
	return relative, nil
}

func (p *SharePublisher) copyFileIntoDeployment(
	source string,
	deploymentRoot string,
	pathMap map[string]string,
	preferredSourceRoot string,
	targetRoot string,
	hashByContent bool,
) (string, error) {
	trimmedSource := strings.TrimSpace(source)
	if trimmedSource == "" {
		return "", nil
	}
	if existing, ok := pathMap[trimmedSource]; ok {
		return existing, nil
	}

	sourcePath, err := p.resolveSourcePath(trimmedSource)
	if err != nil {
		return "", err
	}
	targetPath, err := p.targetPathForDeploymentFile(sourcePath, targetRoot, preferredSourceRoot, hashByContent)
	if err != nil {
		return "", err
	}
	if err := copyFile(sourcePath, targetPath); err != nil {
		return "", err
	}
	relative := deploymentRelativePath(targetPath, deploymentRoot)
	pathMap[trimmedSource] = relative
	return relative, nil
}

func (p *SharePublisher) targetPathForDeploymentFile(
	sourcePath string,
	targetRoot string,
	preferredSourceRoot string,
	hashByContent bool,
) (string, error) {
	if relativePath, ok := relativeWithinRoot(preferredSourceRoot, sourcePath); ok {
		return filepath.Join(targetRoot, relativePath), nil
	}

	digest, err := fileDigestPrefix(sourcePath, hashByContent)
	if err != nil {
		return "", err
	}
	base := filepath.Base(sourcePath)
	extension := filepath.Ext(base)
	stem := strings.TrimSuffix(base, extension)
	if stem == "" {
		stem = "file"
	}
	return filepath.Join(targetRoot, stem+"_"+digest+extension), nil
}

func (p *SharePublisher) resolveSourcePath(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ErrStructuredDataPathInvalid
	}
	if filepath.IsAbs(trimmed) {
		return statefs.NormalizePath(trimmed, "")
	}

	normalizedRelative := filepath.Clean(filepath.FromSlash(trimmed))
	if isManagedSettaFilesRelativePath(normalizedRelative) {
		return statefs.ResolveWithinRoot(p.settaFilesRoot, normalizedRelative, "deployment source path")
	}
	return statefs.ResolveWithinRoot(p.workspaceRoot, normalizedRelative, "deployment source path")
}

func isManagedSettaFilesRelativePath(path string) bool {
	parts := strings.Split(filepath.ToSlash(path), "/")
	if len(parts) == 0 {
		return false
	}
	switch parts[0] {
	case "artifacts", "code", "json_sources":
		return true
	default:
		return false
	}
}

func relativeWithinRoot(root string, candidate string) (string, bool) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return "", false
	}
	resolvedCandidate, err := statefs.NormalizePath(candidate, "")
	if err != nil {
		return "", false
	}

	relativePath, err := filepath.Rel(resolvedRoot, resolvedCandidate)
	if err != nil {
		return "", false
	}
	if relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
		return "", false
	}
	return relativePath, true
}

func copyFile(sourcePath string, targetPath string) error {
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read source file: %w", err)
	}
	return statefs.AtomicWriteFile(targetPath, content, publishFileMode)
}

func deploymentRelativePath(targetPath string, deploymentRoot string) string {
	relativePath, err := filepath.Rel(deploymentRoot, targetPath)
	if err != nil {
		return filepath.ToSlash(filepath.Base(targetPath))
	}
	return filepath.ToSlash(relativePath)
}

func fileDigestPrefix(path string, hashByContent bool) (string, error) {
	input := []byte(path)
	if hashByContent {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			file, err := os.Open(path)
			if err != nil {
				return "", err
			}
			defer file.Close()
			content, err := io.ReadAll(file)
			if err != nil {
				return "", err
			}
			input = content
		}
	}
	sum := md5.Sum(input)
	return hex.EncodeToString(sum[:])[:8], nil
}

func writeJSONFile(path string, payload any) error {
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return statefs.AtomicWriteFile(path, content, publishFileMode)
}

func writeStructuredDataPayload(path string, payload map[string]any) error {
	if payload == nil {
		payload = map[string]any{}
	}
	if err := validateJSONValue(payload, path); err != nil {
		return err
	}

	extension := strings.ToLower(filepath.Ext(path))
	var content []byte
	var err error
	switch extension {
	case ".json":
		content, err = json.MarshalIndent(payload, "", "  ")
		if err == nil {
			content = append(content, '\n')
		}
	case ".yaml", ".yml":
		content, err = yaml.Marshal(payload)
	case ".toml":
		content, err = toml.Marshal(payload)
	default:
		return fmt.Errorf("%w: %s", ErrStructuredDataExtensionUnsupported, path)
	}
	if err != nil {
		return err
	}
	if len(content) == 0 || content[len(content)-1] != '\n' {
		content = append(content, '\n')
	}
	return statefs.AtomicWriteFile(path, content, publishFileMode)
}
