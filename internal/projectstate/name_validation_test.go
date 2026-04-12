package projectstate

import "testing"

// Name validation should aggregate project-level and section-level issues so
// the frontend can render all diagnostics without replaying rename attempts.
func TestCollectNameValidationErrorsReportsProjectAndSectionIssues(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	project.Name = "bad/name"

	target := project.Sections["target"]
	target.Name = "bad/name"
	project.Sections[target.ID] = target

	child := project.Sections["child"]
	child.Name = "Sibling"
	project.Sections[child.ID] = child

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMessage(t, errors.ProjectErrors, "Project name cannot include path separators.")
	assertNameValidationMapMessage(t, errors.SectionErrors, "target", "Section name cannot include path separators.")
	assertNameValidationMapMessage(t, errors.SectionErrors, "child", `Duplicate sibling name "Sibling".`)
	assertNameValidationMapMessage(t, errors.SectionErrors, "sibling", `Duplicate sibling name "Sibling".`)
}

// Reserved Settings projects should keep working with format-only validation
// broadcasts because that path intentionally suppresses the reserved-name rule.
func TestCollectProjectNameFormatErrorsAllowsReservedSettingsName(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)
	project.Name = "Settings"

	if errors := collectProjectNameFormatErrors(project); len(errors) != 0 {
		t.Fatalf("expected no project format errors for Settings, got %#v", errors)
	}
}

// Text blocks with heading-derived names should report the derived-name error
// instead of silently failing to update the section title.
func TestCollectNameValidationErrorsReportsTextBlockHeadingNameErrors(t *testing.T) {
	t.Parallel()

	project := textBlockMutationTestProject(t)
	project.SectionImpls["text-impl"] = SectionImpl{
		ID:   "text-impl",
		Kind: SectionKind("frontend"),
		Payload: mustMarshalProjectObject(map[string]any{
			"id":                   "text-impl",
			"type":                 "TextBlock",
			"text":                 "# Taken Name\n\nBody",
			"format":               "Plaintext",
			"masterFontSizePx":     14.0,
			"headingAsSectionName": true,
			"metaControlStyle":     false,
			"textDisplayMode":      "Render",
		}),
	}

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMapMessage(
		t,
		errors.SectionErrors,
		"text-section",
		`Text block heading cannot be used as section name: Section name "Taken Name" already exists under this parent.`,
	)
}

// Heading-derived section names should also report documented format failures
// like path separators instead of silently dropping the derived-name error.
func TestCollectNameValidationErrorsReportsTextBlockHeadingFormatError(t *testing.T) {
	t.Parallel()

	project := textBlockMutationTestProject(t)
	project.SectionImpls["text-impl"] = SectionImpl{
		ID:   "text-impl",
		Kind: SectionKind("frontend"),
		Payload: mustMarshalProjectObject(map[string]any{
			"id":                   "text-impl",
			"type":                 "TextBlock",
			"text":                 "# Bad/Name\n\nBody",
			"format":               "Plaintext",
			"masterFontSizePx":     14.0,
			"headingAsSectionName": true,
			"metaControlStyle":     false,
			"textDisplayMode":      "Render",
		}),
	}

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMapMessage(
		t,
		errors.SectionErrors,
		"text-section",
		"Text block heading cannot be used as section name: Section name cannot include path separators.",
	)
}

// Param validation must report both format failures and duplicate sibling
// conflicts because the frontend surfaces both states simultaneously.
func TestCollectNameValidationErrorsReportsParamFormatAndConflicts(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	callableParam := project.CodeObjs["callable-param"]
	callableParam.Name = "invalid name"
	project.CodeObjs[callableParam.ID] = callableParam

	sharedChild := project.CodeObjs["shared-child"]
	sharedChild.Name = "other"
	project.CodeObjs[sharedChild.ID] = sharedChild

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMapMessage(t, errors.ParamErrors, "callable-param", "Param name must be a valid Python identifier.")
	assertNameValidationMapMessage(t, errors.ParamErrors, "shared-child", `Duplicate param name "other".`)
	assertNameValidationMapMessage(t, errors.ParamErrors, "shared-other", `Duplicate param name "other".`)
}

// Top-level section validation snapshots should keep reporting Python
// identifier collisions even when the names remain distinct before sanitizing.
func TestCollectNameValidationErrorsFlagsTopLevelSectionIdentifierConflict(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)

	target := project.Sections["target"]
	target.Name = "Foo Bar"
	project.Sections[target.ID] = target

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMapMessage(
		t,
		errors.SectionErrors,
		"target",
		"Section name conflicts with another top-level name after Python identifier sanitization.",
	)
	assertNameValidationMapMessage(
		t,
		errors.SectionErrors,
		"existing",
		"Section name conflicts with another top-level name after Python identifier sanitization.",
	)
}

// Snapshot validation should mirror rename-time slug collision checks so
// background broadcasts keep reporting conflicting top-level paths.
func TestCollectNameValidationErrorsReportsSectionSlugConflict(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)

	existing := project.Sections["existing"]
	existing.Name = "Foo"
	project.Sections[existing.ID] = existing

	target := project.Sections["target"]
	target.Name = "foo"
	project.Sections[target.ID] = target

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMapMessage(t, errors.SectionErrors, "target", `Section path slug "foo" conflicts with another section.`)
	assertNameValidationMapMessage(t, errors.SectionErrors, "existing", `Section path slug "foo" conflicts with another section.`)
}

// Section validation snapshots intentionally allow Chat_ because the current
// route namespace is explicit rather than colliding with a bare chat slug.
func TestCollectNameValidationErrorsAllowsChatSlugSectionName(t *testing.T) {
	t.Parallel()

	project := sectionNameTestProject(t)

	target := project.Sections["target"]
	target.Name = "Chat_"
	project.Sections[target.ID] = target

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	if messages := errors.SectionErrors["target"]; len(messages) != 0 {
		t.Fatalf("expected no Chat_ section-name errors, got %#v", messages)
	}
}

// Meta-control params stay on the same Python-identifier format rules in the
// validation snapshot even though they skip parent-sibling duplicate checks.
func TestCollectNameValidationErrorsReportsMetaControlParamFormatErrors(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	metaParam := project.CodeObjs["meta-param"]
	metaParam.Name = "invalid name"
	project.CodeObjs[metaParam.ID] = metaParam

	errors, err := CollectNameValidationErrors(
		Document{
			SchemaVersion:    CurrentSchemaVersion,
			DefaultProjectID: project.ID,
			Projects: map[string]Project{
				project.ID: project,
			},
		},
		project.ID,
	)
	if err != nil {
		t.Fatalf("CollectNameValidationErrors returned error: %v", err)
	}

	assertNameValidationMapMessage(t, errors.ParamErrors, "meta-param", "Param name must be a valid Python identifier.")
}

func assertNameValidationMapMessage(t *testing.T, errorsByID map[string][]string, id string, want string) {
	t.Helper()

	assertNameValidationMessage(t, errorsByID[id], want)
}

func assertNameValidationMessage(t *testing.T, messages []string, want string) {
	t.Helper()

	for _, message := range messages {
		if message == want {
			return
		}
	}
	t.Fatalf("expected name validation message %q in %#v", want, messages)
}
