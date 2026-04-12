package projectstate

import (
	"errors"
	"testing"
)

func TestProjectNormalizedRejectsSectionMissingDefaultVariant(t *testing.T) {
	t.Parallel()

	project := testProjectGraphValidationProject()
	project.Sections["section-a"] = Section{
		ID:         "section-a",
		Name:       "Section A",
		VariantIDs: []string{"variant-a"},
	}

	_, err := project.Normalized()
	if !errors.Is(err, ErrSectionDefaultVariantMissing) {
		t.Fatalf("expected ErrSectionDefaultVariantMissing, got %v", err)
	}
}

func TestProjectNormalizedRejectsCodeObjectMissingDefaultVariant(t *testing.T) {
	t.Parallel()

	project := testProjectGraphValidationProject()
	project.CodeObjs = map[string]CodeObject{
		"code-a": {
			ID:         "code-a",
			Name:       "Code A",
			VariantIDs: []string{"variant-a"},
		},
	}

	_, err := project.Normalized()
	if !errors.Is(err, ErrCodeObjDefaultVariantMissing) {
		t.Fatalf("expected ErrCodeObjDefaultVariantMissing, got %v", err)
	}
}

func TestProjectNormalizedRejectsMissingTopLevelSection(t *testing.T) {
	t.Parallel()

	project := testProjectGraphValidationProject()
	project.TopLevelSectionIDs = []string{"missing-section"}

	_, err := project.Normalized()
	if !errors.Is(err, ErrTopLevelSectionNotFound) {
		t.Fatalf("expected ErrTopLevelSectionNotFound, got %v", err)
	}
}

func TestProjectNormalizedRejectsDuplicateTopLevelSectionIDs(t *testing.T) {
	t.Parallel()

	project := testProjectGraphValidationProject()
	project.TopLevelSectionIDs = []string{"section-a", "section-a"}

	_, err := project.Normalized()
	if !errors.Is(err, ErrDuplicateTopLevelSection) {
		t.Fatalf("expected ErrDuplicateTopLevelSection, got %v", err)
	}
}

func testProjectGraphValidationProject() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		Sections: map[string]Section{
			"section-a": {
				ID:   "section-a",
				Name: "Section A",
			},
		},
	}
}
