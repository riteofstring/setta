package contracts

import (
	"errors"
	"fmt"
	"math"
)

const (
	maximumPresentationSections = 64
	maximumPresentationViews    = 16
)

type presentationSectionValidator func(PresentationSection, map[string]FieldDefinition, map[string]map[string]struct{}) error

type presentationSectionConfiguration struct {
	allowed  map[string]bool
	validate presentationSectionValidator
}

var presentationSectionConfigurations = map[string]presentationSectionConfiguration{
	"facets": {
		allowed:  map[string]bool{"fieldIds": true},
		validate: validateFacetSection,
	},
	"gallery": {
		allowed:  map[string]bool{"artifactRoles": true},
		validate: validateGallerySection,
	},
	"heatmap": {
		allowed:  map[string]bool{"aggregation": true, "valueFieldId": true, "xFieldId": true, "yFieldId": true},
		validate: validateHeatmapSection,
	},
	"histogram": {
		allowed:  map[string]bool{"bins": true, "fieldId": true},
		validate: validateHistogramSection,
	},
	"metrics": {
		allowed:  map[string]bool{"aggregation": true, "fieldIds": true},
		validate: validateMetricsSection,
	},
	"parallel": {
		allowed:  map[string]bool{"fieldIds": true},
		validate: validateParallelSection,
	},
	"scatter": {
		allowed:  map[string]bool{"colorFieldId": true, "xFieldId": true, "yFieldId": true},
		validate: validateScatterSection,
	},
	"table": {
		allowed:  map[string]bool{"fieldIds": true},
		validate: validateTableSection,
	},
	"timeline": {
		allowed:  map[string]bool{"artifactRole": true, "detailFieldIds": true},
		validate: validateTimelineSection,
	},
}

func (presentation ExperimentPresentation) Validate(fields []FieldDefinition, artifacts []ArtifactReference, relations []ArtifactRelation) error {
	if err := presentation.validateShape(); err != nil {
		return err
	}
	fieldByID := indexFields(fields)
	roleMediaTypes := indexRoleMediaTypes(artifacts, relations)
	sectionIDs, err := validatePresentationSections(presentation.Sections, fieldByID, roleMediaTypes)
	if err != nil {
		return err
	}
	viewIDs, placedSectionIDs, err := validatePresentationViews(presentation.Views, sectionIDs)
	if err != nil {
		return err
	}
	return presentation.validateCoverage(sectionIDs, viewIDs, placedSectionIDs)
}

func (presentation ExperimentPresentation) validateShape() error {
	if err := identifier(presentation.InitialViewID, "initial presentation view id"); err != nil {
		return err
	}
	if len(presentation.Sections) == 0 || len(presentation.Sections) > maximumPresentationSections {
		return errors.New("presentation sections must contain between 1 and 64 entries")
	}
	if len(presentation.Views) == 0 || len(presentation.Views) > maximumPresentationViews {
		return errors.New("presentation views must contain between 1 and 16 entries")
	}
	return nil
}

func indexFields(fields []FieldDefinition) map[string]FieldDefinition {
	fieldByID := make(map[string]FieldDefinition, len(fields))
	for _, field := range fields {
		fieldByID[field.ID] = field
	}
	return fieldByID
}

func indexRoleMediaTypes(artifacts []ArtifactReference, relations []ArtifactRelation) map[string]map[string]struct{} {
	artifactByID := make(map[string]ArtifactReference, len(artifacts))
	for _, artifact := range artifacts {
		artifactByID[artifact.ID] = artifact
	}
	roleMediaTypes := map[string]map[string]struct{}{}
	for _, relation := range relations {
		artifact, exists := artifactByID[relation.ArtifactID]
		if !exists {
			continue
		}
		if roleMediaTypes[relation.Role] == nil {
			roleMediaTypes[relation.Role] = map[string]struct{}{}
		}
		roleMediaTypes[relation.Role][artifact.MediaType] = struct{}{}
	}
	return roleMediaTypes
}

func validatePresentationSections(sections []PresentationSection, fields map[string]FieldDefinition, roleMediaTypes map[string]map[string]struct{}) (map[string]struct{}, error) {
	sectionIDs := map[string]struct{}{}
	for _, section := range sections {
		if err := section.Validate(fields, roleMediaTypes); err != nil {
			return nil, fmt.Errorf("presentation section %q: %w", section.ID, err)
		}
		if _, exists := sectionIDs[section.ID]; exists {
			return nil, fmt.Errorf("presentation section %q is repeated", section.ID)
		}
		sectionIDs[section.ID] = struct{}{}
	}
	return sectionIDs, nil
}

func validatePresentationViews(views []PresentationView, sectionIDs map[string]struct{}) (map[string]struct{}, map[string]struct{}, error) {
	viewIDs := map[string]struct{}{}
	placedSectionIDs := map[string]struct{}{}
	for _, view := range views {
		if err := view.Validate(sectionIDs, placedSectionIDs); err != nil {
			return nil, nil, fmt.Errorf("presentation view %q: %w", view.ID, err)
		}
		if _, exists := viewIDs[view.ID]; exists {
			return nil, nil, fmt.Errorf("presentation view %q is repeated", view.ID)
		}
		viewIDs[view.ID] = struct{}{}
	}
	return viewIDs, placedSectionIDs, nil
}

func (presentation ExperimentPresentation) validateCoverage(sectionIDs map[string]struct{}, viewIDs map[string]struct{}, placedSectionIDs map[string]struct{}) error {
	if _, exists := viewIDs[presentation.InitialViewID]; !exists {
		return fmt.Errorf("initial presentation view %q is unknown", presentation.InitialViewID)
	}
	for sectionID := range sectionIDs {
		if _, exists := placedSectionIDs[sectionID]; !exists {
			return fmt.Errorf("presentation section %q is not placed in a view", sectionID)
		}
	}
	return nil
}

func (section PresentationSection) Validate(fields map[string]FieldDefinition, roleMediaTypes map[string]map[string]struct{}) error {
	if err := identifier(section.ID, "section id"); err != nil {
		return err
	}
	if err := requiredText(section.Title, 200, "section title"); err != nil {
		return err
	}
	configuration, exists := presentationSectionConfigurations[section.Type]
	if !exists {
		return errors.New("section type is invalid")
	}
	if err := configuration.validate(section, fields, roleMediaTypes); err != nil {
		return err
	}
	return section.rejectUnexpectedConfiguration(configuration.allowed)
}

func validateFacetSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	return validateFieldIDs(section.FieldIDs, 1, 12, fields, factorField)
}

func validateScatterSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	if err := validateFieldPointer(section.XFieldID, "x field", fields, numericField); err != nil {
		return err
	}
	if err := validateFieldPointer(section.YFieldID, "y field", fields, numericField); err != nil {
		return err
	}
	if section.ColorFieldID == nil {
		return nil
	}
	return validateFieldPointer(section.ColorFieldID, "color field", fields, factorField)
}

func validateHistogramSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	if err := validateFieldPointer(section.FieldID, "histogram field", fields, numericField); err != nil {
		return err
	}
	if section.Bins == nil || *section.Bins < 4 || *section.Bins > 100 {
		return errors.New("histogram bins must be between 4 and 100")
	}
	return nil
}

func validateHeatmapSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	if err := validateFieldPointer(section.XFieldID, "x field", fields, factorField); err != nil {
		return err
	}
	if err := validateFieldPointer(section.YFieldID, "y field", fields, factorField); err != nil {
		return err
	}
	if err := validateFieldPointer(section.ValueFieldID, "value field", fields, numericField); err != nil {
		return err
	}
	return validateAggregation(section.Aggregation, "heatmap")
}

func validateParallelSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	return validateFieldIDs(section.FieldIDs, 2, 12, fields, numericField)
}

func validateTableSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	return validateFieldIDs(section.FieldIDs, 1, 20, fields, anyField)
}

func validateMetricsSection(section PresentationSection, fields map[string]FieldDefinition, _ map[string]map[string]struct{}) error {
	if err := validateFieldIDs(section.FieldIDs, 1, 12, fields, numericField); err != nil {
		return err
	}
	return validateAggregation(section.Aggregation, "metrics")
}

func validateTimelineSection(section PresentationSection, fields map[string]FieldDefinition, roleMediaTypes map[string]map[string]struct{}) error {
	if section.ArtifactRole == nil || !rolePattern.MatchString(*section.ArtifactRole) {
		return errors.New("timeline artifact role is invalid")
	}
	if _, exists := roleMediaTypes[*section.ArtifactRole]["application/vnd.setta.series+json"]; !exists {
		return fmt.Errorf("timeline artifact role %q has no series artifacts", *section.ArtifactRole)
	}
	return validateFieldIDs(section.DetailFieldIDs, 0, 8, fields, anyField)
}

func validateGallerySection(section PresentationSection, _ map[string]FieldDefinition, roleMediaTypes map[string]map[string]struct{}) error {
	if len(section.ArtifactRoles) == 0 || len(section.ArtifactRoles) > 12 {
		return errors.New("gallery artifact roles must contain between 1 and 12 entries")
	}
	if err := uniqueRoles(section.ArtifactRoles); err != nil {
		return err
	}
	if err := validateGalleryRoles(section.ArtifactRoles, roleMediaTypes); err != nil {
		return err
	}
	return nil
}

func validateGalleryRoles(roles []string, roleMediaTypes map[string]map[string]struct{}) error {
	for _, role := range roles {
		mediaTypes, exists := roleMediaTypes[role]
		if !exists {
			return fmt.Errorf("gallery artifact role %q is unknown", role)
		}
		if len(mediaTypes) == 1 {
			if _, seriesOnly := mediaTypes["application/vnd.setta.series+json"]; seriesOnly {
				return fmt.Errorf("gallery artifact role %q contains only series artifacts", role)
			}
		}
	}
	return nil
}

func validateAggregation(aggregation *string, label string) error {
	if aggregation == nil || !oneOf(*aggregation, "count", "mean", "min", "max", "median") {
		return fmt.Errorf("%s aggregation is invalid", label)
	}
	return nil
}

func (section PresentationSection) rejectUnexpectedConfiguration(allowed map[string]bool) error {
	present := map[string]bool{
		"fieldIds":       section.FieldIDs != nil,
		"fieldId":        section.FieldID != nil,
		"xFieldId":       section.XFieldID != nil,
		"yFieldId":       section.YFieldID != nil,
		"colorFieldId":   section.ColorFieldID != nil,
		"valueFieldId":   section.ValueFieldID != nil,
		"aggregation":    section.Aggregation != nil,
		"bins":           section.Bins != nil,
		"artifactRole":   section.ArtifactRole != nil,
		"artifactRoles":  section.ArtifactRoles != nil,
		"detailFieldIds": section.DetailFieldIDs != nil,
	}
	for key, exists := range present {
		if exists && !allowed[key] {
			return fmt.Errorf("%s is not valid for a %s section", key, section.Type)
		}
	}
	return nil
}

func (view PresentationView) Validate(sectionIDs map[string]struct{}, placedSectionIDs map[string]struct{}) error {
	if err := identifier(view.ID, "view id"); err != nil {
		return err
	}
	if err := requiredText(view.Name, 120, "view name"); err != nil {
		return err
	}
	if err := view.Viewport.Validate(); err != nil {
		return err
	}
	return validatePresentationPlacements(view.Placements, sectionIDs, placedSectionIDs)
}

func (viewport PresentationViewport) Validate() error {
	if !finite(viewport.X) || !finite(viewport.Y) || math.Abs(viewport.X) > 1_000_000 || math.Abs(viewport.Y) > 1_000_000 {
		return errors.New("view viewport position is invalid")
	}
	if !finite(viewport.Zoom) || viewport.Zoom < 0.1 || viewport.Zoom > 4 {
		return errors.New("view viewport zoom must be between 0.1 and 4")
	}
	return nil
}

func validatePresentationPlacements(placements []PresentationPlacement, sectionIDs map[string]struct{}, placedSectionIDs map[string]struct{}) error {
	if len(placements) == 0 || len(placements) > maximumPresentationSections {
		return errors.New("view placements must contain between 1 and 64 entries")
	}
	seen := map[string]struct{}{}
	for _, placement := range placements {
		if err := placement.Validate(sectionIDs); err != nil {
			return err
		}
		if _, exists := seen[placement.SectionID]; exists {
			return fmt.Errorf("section %q is placed more than once", placement.SectionID)
		}
		seen[placement.SectionID] = struct{}{}
		placedSectionIDs[placement.SectionID] = struct{}{}
	}
	return nil
}

func (placement PresentationPlacement) Validate(sectionIDs map[string]struct{}) error {
	if _, exists := sectionIDs[placement.SectionID]; !exists {
		return fmt.Errorf("placement references unknown section %q", placement.SectionID)
	}
	if placement.X < -100_000 || placement.X > 100_000 || placement.Y < -100_000 || placement.Y > 100_000 {
		return errors.New("placement position is invalid")
	}
	if placement.Width < 320 || placement.Width > 4_000 || placement.Height < 220 || placement.Height > 3_000 {
		return errors.New("placement size is invalid")
	}
	return nil
}

func validateFieldPointer(fieldID *string, label string, fields map[string]FieldDefinition, accepts func(FieldDefinition) bool) error {
	if fieldID == nil {
		return fmt.Errorf("%s is required", label)
	}
	field, exists := fields[*fieldID]
	if !exists {
		return fmt.Errorf("%s %q is unknown", label, *fieldID)
	}
	if !accepts(field) {
		return fmt.Errorf("%s %q is incompatible", label, *fieldID)
	}
	return nil
}

func validateFieldIDs(fieldIDs []string, minimum int, maximum int, fields map[string]FieldDefinition, accepts func(FieldDefinition) bool) error {
	if fieldIDs == nil || len(fieldIDs) < minimum || len(fieldIDs) > maximum {
		return fmt.Errorf("fieldIds must contain between %d and %d entries", minimum, maximum)
	}
	seen := map[string]struct{}{}
	for _, fieldID := range fieldIDs {
		field, exists := fields[fieldID]
		if !exists {
			return fmt.Errorf("field %q is unknown", fieldID)
		}
		if !accepts(field) {
			return fmt.Errorf("field %q is incompatible", fieldID)
		}
		if _, exists := seen[fieldID]; exists {
			return fmt.Errorf("field %q is repeated", fieldID)
		}
		seen[fieldID] = struct{}{}
	}
	return nil
}

func uniqueRoles(roles []string) error {
	seen := map[string]struct{}{}
	for _, role := range roles {
		if !rolePattern.MatchString(role) {
			return fmt.Errorf("artifact role %q is invalid", role)
		}
		if _, exists := seen[role]; exists {
			return fmt.Errorf("artifact role %q is repeated", role)
		}
		seen[role] = struct{}{}
	}
	return nil
}

func numericField(field FieldDefinition) bool {
	return field.ValueType == "number"
}

func factorField(field FieldDefinition) bool {
	return field.Role == "factor"
}

func anyField(FieldDefinition) bool {
	return true
}
