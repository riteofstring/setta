package prompttemplates

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const (
	DirName         = "prompts"
	defaultFileMode = 0o644
)

var (
	ErrRootRequired     = errors.New("prompt templates root is required")
	ErrTemplateNotFound = errors.New("prompt template not found")
)

type Format string

const (
	FormatJinja Format = "Jinja"
)

type Template struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Template    string         `json:"template"`
	Format      Format         `json:"format"`
	InputSchema map[string]any `json:"inputSchema"`
	Metadata    map[string]any `json:"metadata"`
}

type Store struct {
	root string
	dir  string
}

func NewStore(root string) (*Store, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		if strings.TrimSpace(root) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	return &Store{
		root: resolvedRoot,
		dir:  filepath.Join(resolvedRoot, DirName),
	}, nil
}

func (s *Store) Dir() string {
	if s == nil {
		return ""
	}
	return s.dir
}

func (s *Store) List() ([]Template, error) {
	if s == nil || strings.TrimSpace(s.dir) == "" {
		return nil, ErrRootRequired
	}

	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Template{}, nil
		}
		return nil, fmt.Errorf("list prompt templates: %w", err)
	}

	templates := make([]Template, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		template, err := s.Get(strings.TrimSuffix(entry.Name(), ".json"))
		if err != nil {
			return nil, err
		}
		templates = append(templates, template)
	}
	return templates, nil
}

func (s *Store) Get(templateID string) (Template, error) {
	if s == nil {
		return Template{}, ErrRootRequired
	}

	trimmedTemplateID := strings.TrimSpace(templateID)
	if trimmedTemplateID == "" {
		return Template{}, fmt.Errorf("%w: template id is required", ErrTemplateNotFound)
	}

	content, err := os.ReadFile(s.templatePath(trimmedTemplateID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Template{}, fmt.Errorf("%w: %q", ErrTemplateNotFound, trimmedTemplateID)
		}
		return Template{}, fmt.Errorf("read prompt template: %w", err)
	}
	return decodeTemplate(content)
}

func (s *Store) Save(template Template) error {
	if s == nil || strings.TrimSpace(s.dir) == "" {
		return ErrRootRequired
	}

	normalized, err := normalizeTemplate(template)
	if err != nil {
		return err
	}
	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode prompt template: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.templatePath(normalized.ID), content, defaultFileMode); err != nil {
		return fmt.Errorf("write prompt template: %w", err)
	}
	return nil
}

func (s *Store) Delete(templateID string) error {
	if s == nil {
		return ErrRootRequired
	}

	trimmedTemplateID := strings.TrimSpace(templateID)
	if trimmedTemplateID == "" {
		return fmt.Errorf("%w: template id is required", ErrTemplateNotFound)
	}

	if err := os.Remove(s.templatePath(trimmedTemplateID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete prompt template: %w", err)
	}
	return nil
}

func decodeTemplate(content []byte) (Template, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()

	type rawTemplate struct {
		ID          *string        `json:"id"`
		Name        *string        `json:"name"`
		Description *string        `json:"description"`
		Template    *string        `json:"template"`
		Format      *Format        `json:"format"`
		InputSchema map[string]any `json:"inputSchema"`
		Metadata    map[string]any `json:"metadata"`
	}

	var raw rawTemplate
	if err := decoder.Decode(&raw); err != nil {
		return Template{}, fmt.Errorf("decode prompt template: %w", err)
	}

	if raw.ID == nil {
		return Template{}, fmt.Errorf("prompt template id is required")
	}
	if raw.Name == nil {
		return Template{}, fmt.Errorf("prompt template %q name is required", strings.TrimSpace(*raw.ID))
	}
	if raw.Template == nil {
		return Template{}, fmt.Errorf("prompt template %q template is required", strings.TrimSpace(*raw.ID))
	}

	template := Template{
		ID:       *raw.ID,
		Name:     *raw.Name,
		Template: *raw.Template,
	}
	if raw.Description != nil {
		template.Description = *raw.Description
	}
	if raw.Format != nil {
		template.Format = *raw.Format
	}
	if raw.InputSchema != nil {
		template.InputSchema = raw.InputSchema
	}
	if raw.Metadata != nil {
		template.Metadata = raw.Metadata
	}
	return normalizeTemplate(template)
}

func normalizeTemplate(template Template) (Template, error) {
	normalized := Template{
		ID:          strings.TrimSpace(template.ID),
		Name:        template.Name,
		Description: template.Description,
		Template:    template.Template,
		Format:      template.Format,
		InputSchema: cloneAnyMap(template.InputSchema),
		Metadata:    cloneAnyMap(template.Metadata),
	}
	if normalized.ID == "" {
		return Template{}, fmt.Errorf("prompt template id is required")
	}
	switch normalized.Format {
	case "":
		normalized.Format = FormatJinja
	case FormatJinja:
	default:
		return Template{}, fmt.Errorf("prompt template %q format %q is invalid", normalized.ID, normalized.Format)
	}
	if normalized.InputSchema == nil {
		normalized.InputSchema = map[string]any{}
	}
	if normalized.Metadata == nil {
		normalized.Metadata = map[string]any{}
	}
	return normalized, nil
}

func (s *Store) templatePath(templateID string) string {
	return filepath.Join(s.dir, strings.TrimSpace(templateID)+".json")
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = deepCloneJSONValue(value)
	}
	return cloned
}

func deepCloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneAnyMap(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, deepCloneJSONValue(entry))
		}
		return cloned
	default:
		return typed
	}
}
