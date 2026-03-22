package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrBrowserSectionRequired     = errors.New("section must resolve to a browser section")
	ErrBrowserAreaViewModeInvalid = errors.New("browser area view mode is invalid")
	ErrBrowserSearchScopeInvalid  = errors.New("browser search scope is invalid")
)

type BrowserAreaViewMode string

const (
	BrowserAreaViewModeList      BrowserAreaViewMode = "list"
	BrowserAreaViewModeThumbnail BrowserAreaViewMode = "thumbnail"
	BrowserAreaViewModeCarousel  BrowserAreaViewMode = "carousel"
)

type BrowserSearchScope string

const (
	BrowserSearchScopeRecursive BrowserSearchScope = "recursive"
	BrowserSearchScopeLocal     BrowserSearchScope = "local"
)

type BrowserSavedSearchTypeFilters struct {
	Image bool `json:"image"`
	Video bool `json:"video"`
	Audio bool `json:"audio"`
	Text  bool `json:"text"`
	Data  bool `json:"data"`
}

type BrowserSavedSearch struct {
	ID          string                         `json:"id"`
	Name        string                         `json:"name"`
	Query       string                         `json:"query"`
	SearchScope BrowserSearchScope             `json:"searchScope"`
	TypeFilters *BrowserSavedSearchTypeFilters `json:"typeFilters"`
	Color       string                         `json:"color"`
	QuickInfo   string                         `json:"quickInfo"`
}

func (p *Project) SetBrowserColumnWidths(sectionID string, columnWidth *float64, typesColumnWidth *float64) error {
	section, _, _, err := p.resolveBrowserSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.applyBrowserSectionUpdates(section.ID, map[string]any{
		"columnWidth":      optionalFloat64Value(columnWidth),
		"typesColumnWidth": optionalFloat64Value(typesColumnWidth),
	})
}

func (d *Document) SetBrowserColumnWidths(projectID string, sectionID string, columnWidth *float64, typesColumnWidth *float64) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetBrowserColumnWidths(sectionID, columnWidth, typesColumnWidth); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetBrowserColumnWidths(
	ctx context.Context,
	projectID string,
	sectionID string,
	columnWidth *float64,
	typesColumnWidth *float64,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetBrowserColumnWidths(projectID, sectionID, columnWidth, typesColumnWidth); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetBrowserAreaViewMode(sectionID string, viewMode BrowserAreaViewMode) error {
	section, _, _, err := p.resolveBrowserSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedViewMode, err := normalizeBrowserAreaViewMode(viewMode)
	if err != nil {
		return err
	}
	return p.applyBrowserSectionUpdates(section.ID, map[string]any{
		"viewMode": string(normalizedViewMode),
	})
}

func (d *Document) SetBrowserAreaViewMode(projectID string, sectionID string, viewMode BrowserAreaViewMode) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetBrowserAreaViewMode(sectionID, viewMode); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetBrowserAreaViewMode(
	ctx context.Context,
	projectID string,
	sectionID string,
	viewMode BrowserAreaViewMode,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetBrowserAreaViewMode(projectID, sectionID, viewMode); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetBrowserHideColumn(sectionID string, hideColumn bool) error {
	section, _, _, err := p.resolveBrowserSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.applyBrowserSectionUpdates(section.ID, map[string]any{
		"hideColumn": hideColumn,
	})
}

func (d *Document) SetBrowserHideColumn(projectID string, sectionID string, hideColumn bool) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetBrowserHideColumn(sectionID, hideColumn); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetBrowserHideColumn(
	ctx context.Context,
	projectID string,
	sectionID string,
	hideColumn bool,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetBrowserHideColumn(projectID, sectionID, hideColumn); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetBrowserSavedSearches(sectionID string, savedSearches []BrowserSavedSearch) error {
	section, _, _, err := p.resolveBrowserSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedSavedSearches, err := normalizeBrowserSavedSearches(savedSearches)
	if err != nil {
		return err
	}
	return p.applyBrowserSectionUpdates(section.ID, map[string]any{
		"savedSearches": normalizedSavedSearches,
	})
}

func (d *Document) SetBrowserSavedSearches(projectID string, sectionID string, savedSearches []BrowserSavedSearch) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetBrowserSavedSearches(sectionID, savedSearches); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetBrowserSavedSearches(
	ctx context.Context,
	projectID string,
	sectionID string,
	savedSearches []BrowserSavedSearch,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetBrowserSavedSearches(projectID, sectionID, savedSearches); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) applyBrowserSectionUpdates(sectionID string, updates map[string]any) error {
	trimmedSectionID := strings.TrimSpace(sectionID)
	for fieldName, fieldValue := range updates {
		if err := p.setCurrentSectionField(trimmedSectionID, fieldName, fieldValue); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) resolveBrowserSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
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
	if !strings.EqualFold(sectionType, "Browser") {
		return Section{}, SectionVariant{}, nil, fmt.Errorf("%w: %q", ErrBrowserSectionRequired, section.ID)
	}
	return section, variant, payload, nil
}

func normalizeBrowserAreaViewMode(mode BrowserAreaViewMode) (BrowserAreaViewMode, error) {
	trimmed := BrowserAreaViewMode(strings.TrimSpace(string(mode)))
	switch trimmed {
	case BrowserAreaViewModeList, BrowserAreaViewModeThumbnail, BrowserAreaViewModeCarousel:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrBrowserAreaViewModeInvalid, trimmed)
	}
}

func normalizeBrowserSearchScope(scope BrowserSearchScope) (BrowserSearchScope, error) {
	trimmed := BrowserSearchScope(strings.TrimSpace(string(scope)))
	if trimmed == "" {
		return BrowserSearchScopeRecursive, nil
	}
	switch trimmed {
	case BrowserSearchScopeRecursive, BrowserSearchScopeLocal:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrBrowserSearchScopeInvalid, trimmed)
	}
}

func normalizeBrowserSavedSearches(savedSearches []BrowserSavedSearch) ([]BrowserSavedSearch, error) {
	if len(savedSearches) == 0 {
		return []BrowserSavedSearch{}, nil
	}

	normalized := make([]BrowserSavedSearch, 0, len(savedSearches))
	for _, savedSearch := range savedSearches {
		searchScope, err := normalizeBrowserSearchScope(savedSearch.SearchScope)
		if err != nil {
			return nil, err
		}
		typeFilters := cloneBrowserSavedSearchTypeFilters(savedSearch.TypeFilters)
		normalized = append(normalized, BrowserSavedSearch{
			ID:          savedSearch.ID,
			Name:        savedSearch.Name,
			Query:       savedSearch.Query,
			SearchScope: searchScope,
			TypeFilters: &typeFilters,
			Color:       savedSearch.Color,
			QuickInfo:   savedSearch.QuickInfo,
		})
	}
	return normalized, nil
}

func cloneBrowserSavedSearchTypeFilters(filters *BrowserSavedSearchTypeFilters) BrowserSavedSearchTypeFilters {
	if filters == nil {
		return BrowserSavedSearchTypeFilters{
			Image: true,
			Video: true,
			Audio: true,
			Text:  true,
			Data:  true,
		}
	}
	return BrowserSavedSearchTypeFilters{
		Image: filters.Image,
		Video: filters.Video,
		Audio: filters.Audio,
		Text:  filters.Text,
		Data:  filters.Data,
	}
}

func optionalFloat64Value(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}
