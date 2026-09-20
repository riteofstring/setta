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

func (presentation ExperimentPresentation) Validate(fields []FieldDefinition, artifacts []ArtifactReference, relations []ArtifactRelation) error {
	if err := identifier(presentation.InitialViewID, "initial presentation view id"); err != nil {
		return err
	}
	if len(presentation.Sections) == 0 || len(presentation.Sections) > maximumPresentationSections {
		return errors.New("presentation sections must contain between 1 and 64 entries")
	}
	if len(presentation.Views) == 0 || len(presentation.Views) > maximumPresentationViews {
		return errors.New("presentation views must contain between 1 and 16 entries")
	}
	fieldByID := make(map[string]FieldDefinition, len(fields))
	for _, field := range fields {
		fieldByID[field.ID] = field
	}
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
	sectionIDs := map[string]struct{}{}
	for _, section := range presentation.Sections {
		if err := section.Validate(fieldByID, roleMediaTypes); err != nil {
			return fmt.Errorf("presentation section %q: %w", section.ID, err)
		}
		if _, exists := sectionIDs[section.ID]; exists {
			return fmt.Errorf("presentation section %q is repeated", section.ID)
		}
		sectionIDs[section.ID] = struct{}{}
	}
	viewIDs := map[string]struct{}{}
	placedSectionIDs := map[string]struct{}{}
	for _, view := range presentation.Views {
		if err := view.Validate(sectionIDs, placedSectionIDs); err != nil {
			return fmt.Errorf("presentation view %q: %w", view.ID, err)
		}
		if _, exists := viewIDs[view.ID]; exists {
			return fmt.Errorf("presentation view %q is repeated", view.ID)
		}
		viewIDs[view.ID] = struct{}{}
	}
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
	allowed := map[string]bool{}
	switch section.Type {
	case "facets":
		allowed["fieldIds"] = true
		if err := validateFieldIDs(section.FieldIDs, 1, 12, fields, func(field FieldDefinition) bool { return field.Role == "factor" }); err != nil {
			return err
		}
	case "scatter":
		allowed["xFieldId"] = true
		allowed["yFieldId"] = true
		allowed["colorFieldId"] = true
		if err := validateFieldPointer(section.XFieldID, "x field", fields, numericField); err != nil {
			return err
		}
		if err := validateFieldPointer(section.YFieldID, "y field", fields, numericField); err != nil {
			return err
		}
		if section.ColorFieldID != nil {
			if err := validateFieldPointer(section.ColorFieldID, "color field", fields, func(field FieldDefinition) bool { return field.Role == "factor" }); err != nil {
				return err
			}
		}
	case "histogram":
		allowed["fieldId"] = true
		allowed["bins"] = true
		if err := validateFieldPointer(section.FieldID, "histogram field", fields, numericField); err != nil {
			return err
		}
		if section.Bins == nil || *section.Bins < 4 || *section.Bins > 100 {
			return errors.New("histogram bins must be between 4 and 100")
		}
	case "heatmap":
		allowed["xFieldId"] = true
		allowed["yFieldId"] = true
		allowed["valueFieldId"] = true
		allowed["aggregation"] = true
		if err := validateFieldPointer(section.XFieldID, "x field", fields, factorField); err != nil {
			return err
		}
		if err := validateFieldPointer(section.YFieldID, "y field", fields, factorField); err != nil {
			return err
		}
		if err := validateFieldPointer(section.ValueFieldID, "value field", fields, numericField); err != nil {
			return err
		}
		if section.Aggregation == nil || !oneOf(*section.Aggregation, "count", "mean", "min", "max", "median") {
			return errors.New("heatmap aggregation is invalid")
		}
	case "parallel":
		allowed["fieldIds"] = true
		if err := validateFieldIDs(section.FieldIDs, 2, 12, fields, numericField); err != nil {
			return err
		}
	case "table":
		allowed["fieldIds"] = true
		if err := validateFieldIDs(section.FieldIDs, 1, 20, fields, func(FieldDefinition) bool { return true }); err != nil {
			return err
		}
	case "metrics":
		allowed["fieldIds"] = true
		allowed["aggregation"] = true
		if err := validateFieldIDs(section.FieldIDs, 1, 12, fields, numericField); err != nil {
			return err
		}
		if section.Aggregation == nil || !oneOf(*section.Aggregation, "count", "mean", "min", "max", "median") {
			return errors.New("metrics aggregation is invalid")
		}
	case "timeline":
		allowed["artifactRole"] = true
		allowed["detailFieldIds"] = true
		if section.ArtifactRole == nil || !rolePattern.MatchString(*section.ArtifactRole) {
			return errors.New("timeline artifact role is invalid")
		}
		if _, exists := roleMediaTypes[*section.ArtifactRole]["application/vnd.setta.series+json"]; !exists {
			return fmt.Errorf("timeline artifact role %q has no series artifacts", *section.ArtifactRole)
		}
		if err := validateFieldIDs(section.DetailFieldIDs, 0, 8, fields, func(FieldDefinition) bool { return true }); err != nil {
			return err
		}
	case "gallery":
		allowed["artifactRoles"] = true
		allowed["columns"] = true
		if len(section.ArtifactRoles) == 0 || len(section.ArtifactRoles) > 12 {
			return errors.New("gallery artifact roles must contain between 1 and 12 entries")
		}
		if err := uniqueRoles(section.ArtifactRoles); err != nil {
			return err
		}
		for _, role := range section.ArtifactRoles {
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
		if section.Columns == nil || *section.Columns < 1 || *section.Columns > 6 {
			return errors.New("gallery columns must be between 1 and 6")
		}
	default:
		return errors.New("section type is invalid")
	}
	return section.rejectUnexpectedConfiguration(allowed)
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
		"columns":        section.Columns != nil,
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
	if !finite(view.Viewport.X) || !finite(view.Viewport.Y) || math.Abs(view.Viewport.X) > 1_000_000 || math.Abs(view.Viewport.Y) > 1_000_000 {
		return errors.New("view viewport position is invalid")
	}
	if !finite(view.Viewport.Zoom) || view.Viewport.Zoom < 0.1 || view.Viewport.Zoom > 4 {
		return errors.New("view viewport zoom must be between 0.1 and 4")
	}
	if len(view.Placements) == 0 || len(view.Placements) > maximumPresentationSections {
		return errors.New("view placements must contain between 1 and 64 entries")
	}
	seen := map[string]struct{}{}
	for _, placement := range view.Placements {
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
