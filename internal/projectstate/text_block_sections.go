package projectstate

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
)

var (
	ErrTextBlockSectionRequired    = errors.New("section must resolve to a text block section")
	ErrTextBlockDisplayModeInvalid = errors.New("text block display mode is invalid")
	ErrTextBlockFormatInvalid      = errors.New("text block format is invalid")
)

type TextBlockDisplayMode string

const (
	TextBlockDisplayModeRender TextBlockDisplayMode = "Render"
	TextBlockDisplayModeEdit   TextBlockDisplayMode = "Edit"
)

type TextBlockFormat string

const (
	TextBlockFormatPlaintext TextBlockFormat = "Plaintext"
	TextBlockFormatMarkdown  TextBlockFormat = "Markdown"
)

const (
	textBlockMasterFontSizeMin     = 8.0
	textBlockMasterFontSizeMax     = 48.0
	textBlockMasterFontSizeDefault = 14.0
)

func (p *Project) SetTextBlockText(sectionID string, text string) error {
	section, _, payload, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "text", text); err != nil {
		return err
	}
	if !payloadBoolField(payload, "headingAsSectionName") {
		return nil
	}
	return p.syncTextBlockSectionName(section.ID, text, payloadStringField(payload, "format"))
}

func (d *Document) SetTextBlockText(projectID string, sectionID string, text string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTextBlockText(sectionID, text); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTextBlockText(ctx context.Context, projectID string, sectionID string, text string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTextBlockText(projectID, sectionID, text); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTextBlockDisplayMode(sectionID string, mode TextBlockDisplayMode) error {
	section, _, _, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedMode, err := normalizeTextBlockDisplayMode(mode)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "textDisplayMode", string(normalizedMode))
}

func (d *Document) SetTextBlockDisplayMode(projectID string, sectionID string, mode TextBlockDisplayMode) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTextBlockDisplayMode(sectionID, mode); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTextBlockDisplayMode(
	ctx context.Context,
	projectID string,
	sectionID string,
	mode TextBlockDisplayMode,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTextBlockDisplayMode(projectID, sectionID, mode); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTextBlockFormat(sectionID string, format TextBlockFormat) error {
	section, _, _, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedFormat, err := normalizeTextBlockFormat(format)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "format", string(normalizedFormat))
}

func (d *Document) SetTextBlockFormat(projectID string, sectionID string, format TextBlockFormat) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTextBlockFormat(sectionID, format); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTextBlockFormat(
	ctx context.Context,
	projectID string,
	sectionID string,
	format TextBlockFormat,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTextBlockFormat(projectID, sectionID, format); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTextBlockHeadingAsSectionName(sectionID string, headingAsSectionName bool) error {
	section, _, payload, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		return err
	}
	if err := p.setCurrentSectionField(section.ID, "headingAsSectionName", headingAsSectionName); err != nil {
		return err
	}
	if !headingAsSectionName {
		return nil
	}
	return p.syncTextBlockSectionName(section.ID, payloadRawStringField(payload, "text"), payloadStringField(payload, "format"))
}

func (d *Document) SetTextBlockHeadingAsSectionName(projectID string, sectionID string, headingAsSectionName bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTextBlockHeadingAsSectionName(sectionID, headingAsSectionName); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTextBlockHeadingAsSectionName(
	ctx context.Context,
	projectID string,
	sectionID string,
	headingAsSectionName bool,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTextBlockHeadingAsSectionName(projectID, sectionID, headingAsSectionName); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTextBlockMetaControlStyle(sectionID string, metaControlStyle bool) error {
	section, _, _, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "metaControlStyle", metaControlStyle)
}

func (d *Document) SetTextBlockMetaControlStyle(projectID string, sectionID string, metaControlStyle bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTextBlockMetaControlStyle(sectionID, metaControlStyle); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTextBlockMetaControlStyle(
	ctx context.Context,
	projectID string,
	sectionID string,
	metaControlStyle bool,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTextBlockMetaControlStyle(projectID, sectionID, metaControlStyle); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetTextBlockMasterFontSize(sectionID string, masterFontSizePx float64) error {
	section, _, _, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "masterFontSizePx", clampTextBlockMasterFontSize(masterFontSizePx))
}

func (d *Document) SetTextBlockMasterFontSize(projectID string, sectionID string, masterFontSizePx float64) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTextBlockMasterFontSize(sectionID, masterFontSizePx); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTextBlockMasterFontSize(
	ctx context.Context,
	projectID string,
	sectionID string,
	masterFontSizePx float64,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTextBlockMasterFontSize(projectID, sectionID, masterFontSizePx); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) resolveTextBlockMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}

	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	if !strings.EqualFold(sectionType, "TextBlock") {
		return Section{}, SectionVariant{}, nil, fmt.Errorf("%w: %q", ErrTextBlockSectionRequired, section.ID)
	}
	return section, variant, payload, nil
}

func normalizeTextBlockDisplayMode(mode TextBlockDisplayMode) (TextBlockDisplayMode, error) {
	trimmed := TextBlockDisplayMode(strings.TrimSpace(string(mode)))
	switch trimmed {
	case TextBlockDisplayModeRender, TextBlockDisplayModeEdit:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrTextBlockDisplayModeInvalid, trimmed)
	}
}

func normalizeTextBlockFormat(format TextBlockFormat) (TextBlockFormat, error) {
	trimmed := TextBlockFormat(strings.TrimSpace(string(format)))
	switch trimmed {
	case TextBlockFormatPlaintext, TextBlockFormatMarkdown:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrTextBlockFormatInvalid, trimmed)
	}
}

func clampTextBlockMasterFontSize(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return textBlockMasterFontSizeDefault
	}
	return math.Max(textBlockMasterFontSizeMin, math.Min(textBlockMasterFontSizeMax, value))
}

func (p *Project) syncTextBlockSectionName(sectionID string, text string, format string) error {
	firstHeading := extractFirstTextBlockHeading(text, format)
	if firstHeading == "" {
		return nil
	}
	if err := p.SetSectionName(sectionID, firstHeading); err != nil {
		var invalidNameErr *InvalidSectionNameError
		if errors.As(err, &invalidNameErr) {
			return nil
		}
		return err
	}
	return nil
}

func extractFirstTextBlockHeading(text string, format string) string {
	if strings.EqualFold(strings.TrimSpace(format), string(TextBlockFormatMarkdown)) {
		return firstMarkdownHeading(text)
	}
	return firstHeadingOrText(text)
}

func firstHeadingOrText(text string) string {
	for _, line := range strings.Split(strings.TrimLeft(text, " \t\r\n"), "\n") {
		trimmedLine := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if !strings.HasPrefix(trimmedLine, "#") {
			continue
		}
		heading := strings.TrimSpace(strings.TrimLeft(trimmedLine, "#"))
		if heading != "" {
			return heading
		}
	}
	return ""
}

func firstMarkdownHeading(text string) string {
	for _, line := range strings.Split(text, "\n") {
		normalizedLine := strings.TrimSuffix(line, "\r")
		leadingSpaces := countLeadingSpaces(normalizedLine)
		if leadingSpaces > 3 {
			continue
		}
		normalizedLine = normalizedLine[leadingSpaces:]
		hashCount := countLeadingHashes(normalizedLine)
		if hashCount == 0 || hashCount > 6 {
			continue
		}
		if len(normalizedLine) > hashCount && normalizedLine[hashCount] == '#' {
			continue
		}
		heading := strings.TrimSpace(normalizedLine[hashCount:])
		if heading != "" {
			return heading
		}
	}
	return ""
}

func countLeadingSpaces(value string) int {
	count := 0
	for count < len(value) && value[count] == ' ' {
		count++
	}
	return count
}

func countLeadingHashes(value string) int {
	count := 0
	for count < len(value) && value[count] == '#' {
		count++
	}
	return count
}
