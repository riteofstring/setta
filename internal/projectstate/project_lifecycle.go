package projectstate

import (
	"context"
	"sort"
	"strings"
)

func (d *Document) CreateProject(previewImgColor string) (string, string, error) {
	if d == nil {
		return "", "", ErrProjectNotFound
	}
	if d.Projects == nil {
		d.Projects = map[string]Project{}
	}

	projectID, err := newProjectStateID()
	if err != nil {
		return "", "", err
	}
	projectName, err := nextAvailableProjectName(*d)
	if err != nil {
		return "", "", err
	}

	project := Project{
		ID:                      projectID,
		Name:                    projectName,
		AllowJSONSourceKeyEdits: true,
		CodegenTargets:          defaultProjectCodegenTargets(),
		PreviewImgColor:         strings.TrimSpace(previewImgColor),
	}
	defaultWindowing := DefaultProjectChatWindowingState()
	project.ProjectChatWindowing = &defaultWindowing
	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		return "", "", err
	}
	createSectionInput := CreateTopLevelSectionInput{
		ImplType: "GenPythonCode",
		Position: &Position{X: 0, Y: 0},
	}
	if project.GeneratedCodeBinding != nil {
		createSectionInput.ImplOverrides = map[string]any{
			"codeFileBinding": map[string]any{
				"canonical_path": project.GeneratedCodeBinding.Path,
				"access_mode":    string(project.GeneratedCodeBinding.AccessMode),
				"autoBinding":    false,
			},
		}
	}
	if _, err := project.CreateTopLevelSection(createSectionInput, StructuralMutationSettings{}); err != nil {
		return "", "", err
	}
	if _, err := project.CreateViewMode(); err != nil {
		return "", "", err
	}
	project.IsEditingViewMode = false

	d.Projects[projectID] = project
	d.reconcileDefaultProjectID()
	return projectID, projectName, nil
}

func (d *Document) CloneProject(projectID string, newName string) (string, string, error) {
	if d == nil {
		return "", "", ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", "", err
	}

	normalizedName, err := validateProjectName(*d, "new-project", newName, false)
	if err != nil {
		return "", "", err
	}
	clonedProjectID, err := newProjectStateID()
	if err != nil {
		return "", "", err
	}

	cloned, err := cloneProjectWithFreshPasswordImplIDs(project)
	if err != nil {
		return "", "", err
	}
	cloned.ID = clonedProjectID
	cloned.Name = normalizedName

	if d.Projects == nil {
		d.Projects = map[string]Project{}
	}
	d.Projects[clonedProjectID] = cloned
	d.reconcileDefaultProjectID()
	return clonedProjectID, normalizedName, nil
}

func (d *Document) SaveAsNewProjectConfig(
	projectID string,
	newName string,
	withRefs bool,
) (string, string, error) {
	if d == nil {
		return "", "", ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", "", err
	}

	normalizedName, err := validateProjectName(*d, "new-project", newName, false)
	if err != nil {
		return "", "", err
	}
	clonedProjectID, err := newProjectStateID()
	if err != nil {
		return "", "", err
	}

	cloned, err := cloneProjectForSaveAs(project, withRefs)
	if err != nil {
		return "", "", err
	}
	cloned.ID = clonedProjectID
	cloned.Name = normalizedName

	if d.Projects == nil {
		d.Projects = map[string]Project{}
	}
	d.Projects[clonedProjectID] = cloned
	d.reconcileDefaultProjectID()
	return clonedProjectID, normalizedName, nil
}

func cloneProjectForSaveAs(project Project, withRefs bool) (Project, error) {
	cloned, err := cloneProjectWithFreshPasswordImplIDs(project)
	if err != nil {
		return Project{}, err
	}
	cloned.WindowSpaces = clearWindowSpaceChatIDs(cloned.WindowSpaces)
	if withRefs {
		emptyWindowing := DefaultProjectChatWindowingState()
		cloned.ProjectChatWindowing = &emptyWindowing
		return cloned, nil
	}
	clearedWindowing := clearProjectChatWindowingChatIDs(cloned.ProjectChatWindowing)
	cloned.ProjectChatWindowing = &clearedWindowing
	return cloned, nil
}

func cloneProjectWithFreshPasswordImplIDs(project Project) (Project, error) {
	cloned := project.Clone()
	if err := rewriteCopiedPasswordImpls(&cloned); err != nil {
		return Project{}, err
	}
	return cloned, nil
}

func rewriteCopiedPasswordImpls(project *Project) error {
	if project == nil || len(project.CodeObjImpls) == 0 {
		return nil
	}

	passwordImplIDs := make([]string, 0, len(project.CodeObjImpls))
	for implID, impl := range project.CodeObjImpls {
		if strings.TrimSpace(impl.Type) != "PasswordParam" {
			continue
		}
		passwordImplIDs = append(passwordImplIDs, implID)
	}
	sort.Strings(passwordImplIDs)
	if len(passwordImplIDs) == 0 {
		return nil
	}

	remappedImplIDs := make(map[string]string, len(passwordImplIDs))
	for _, oldImplID := range passwordImplIDs {
		impl := project.CodeObjImpls[oldImplID]
		newImplID, err := newProjectStateID()
		if err != nil {
			return err
		}

		payload, err := rawObjectFromProjectPayload(impl.Payload)
		if err != nil {
			return err
		}
		payload["id"] = newImplID
		payload["value"] = ""
		payload["defaultVal"] = ""
		payload["hasSecret"] = false

		rawPayload, err := marshalProjectObject(payload)
		if err != nil {
			return err
		}
		impl.ID = newImplID
		impl.Payload = rawPayload
		delete(project.CodeObjImpls, oldImplID)
		project.CodeObjImpls[newImplID] = impl
		remappedImplIDs[oldImplID] = newImplID
	}

	for variantID, variant := range project.CodeObjVariants {
		if newImplID, ok := remappedImplIDs[strings.TrimSpace(variant.ImplID)]; ok {
			variant.ImplID = newImplID
		}
		for index, implID := range variant.NonPresetImplIDs {
			if newImplID, ok := remappedImplIDs[strings.TrimSpace(implID)]; ok {
				variant.NonPresetImplIDs[index] = newImplID
			}
		}
		project.CodeObjVariants[variantID] = variant
	}

	return clearCopiedPasswordSecretMetadata(project)
}

func clearCopiedPasswordSecretMetadata(project *Project) error {
	if project == nil || len(project.CodeObjs) == 0 {
		return nil
	}

	passwordVariantIDs := make(map[string]struct{})
	for variantID, variant := range project.CodeObjVariants {
		impl, ok := project.CodeObjImpls[strings.TrimSpace(variant.ImplID)]
		if !ok || strings.TrimSpace(impl.Type) != "PasswordParam" {
			continue
		}
		passwordVariantIDs[variantID] = struct{}{}
	}
	if len(passwordVariantIDs) == 0 {
		return nil
	}

	for codeObjID, codeObj := range project.CodeObjs {
		hasPasswordVariant := false
		for _, variantID := range codeObj.VariantIDs {
			if _, ok := passwordVariantIDs[strings.TrimSpace(variantID)]; ok {
				hasPasswordVariant = true
				break
			}
		}
		if !hasPasswordVariant {
			continue
		}

		modifier, err := rawObjectFromProjectPayload(codeObj.SharedModifier)
		if err != nil {
			return err
		}
		if _, ok := modifier["hasSecret"]; ok {
			modifier["hasSecret"] = false
			codeObj.SharedModifier, err = marshalOptionalProjectObject(modifier)
			if err != nil {
				return err
			}
			project.CodeObjs[codeObjID] = codeObj
		}
	}

	for variantID := range passwordVariantIDs {
		variant := project.CodeObjVariants[variantID]
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		if _, ok := modifier["hasSecret"]; ok {
			modifier["hasSecret"] = false
			variant.Modifier, err = marshalOptionalProjectObject(modifier)
			if err != nil {
				return err
			}
			project.CodeObjVariants[variantID] = variant
		}
	}

	return nil
}

func (d *Document) DeleteProjects(projectIDs []string) ([]string, error) {
	if d == nil {
		return nil, ErrProjectNotFound
	}
	if len(projectIDs) == 0 {
		return nil, nil
	}

	trimmedIDs := make([]string, 0, len(projectIDs))
	seen := make(map[string]struct{}, len(projectIDs))
	for _, rawProjectID := range projectIDs {
		projectID := strings.TrimSpace(rawProjectID)
		if projectID == "" {
			return nil, ErrProjectIDRequired
		}
		if _, err := d.ProjectByID(projectID); err != nil {
			return nil, err
		}
		if _, ok := seen[projectID]; ok {
			continue
		}
		seen[projectID] = struct{}{}
		trimmedIDs = append(trimmedIDs, projectID)
	}

	for _, projectID := range trimmedIDs {
		delete(d.Projects, projectID)
	}
	d.reconcileDefaultProjectID()
	return trimmedIDs, nil
}

func (r *Runtime) CreateProject(ctx context.Context, previewImgColor string) (Snapshot, string, string, error) {
	var (
		createdProjectID string
		createdName      string
	)
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		projectID, projectName, err := document.CreateProject(previewImgColor)
		if err != nil {
			return Document{}, err
		}
		if r.pythonCodegenSectionReconciler != nil {
			project, err := document.ProjectByID(projectID)
			if err != nil {
				return Document{}, err
			}
			if err := applySupportedPythonCodegenMutation(
				ctx,
				&project,
				nil,
				r.pythonCodegenSectionReconciler,
			); err != nil {
				return Document{}, err
			}
			document.Projects[projectID] = project
		}
		createdProjectID = projectID
		createdName = projectName
		return document, nil
	})
	return snapshot, createdProjectID, createdName, err
}

func (r *Runtime) CloneProject(ctx context.Context, projectID string, newName string) (Snapshot, string, string, error) {
	var (
		clonedProjectID string
		normalizedName  string
	)
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		projectID, projectName, err := document.CloneProject(projectID, newName)
		if err != nil {
			return Document{}, err
		}
		clonedProjectID = projectID
		normalizedName = projectName
		return document, nil
	})
	return snapshot, clonedProjectID, normalizedName, err
}

func (r *Runtime) SaveAsNewProjectConfig(
	ctx context.Context,
	projectID string,
	newName string,
	withRefs bool,
) (Snapshot, string, string, error) {
	var (
		clonedProjectID string
		normalizedName  string
	)
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		projectID, projectName, err := document.SaveAsNewProjectConfig(
			projectID,
			newName,
			withRefs,
		)
		if err != nil {
			return Document{}, err
		}
		clonedProjectID = projectID
		normalizedName = projectName
		return document, nil
	})
	return snapshot, clonedProjectID, normalizedName, err
}

func (r *Runtime) DeleteProjects(ctx context.Context, projectIDs []string) (Snapshot, []string, error) {
	var deletedIDs []string
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		removedIDs, err := document.DeleteProjects(projectIDs)
		if err != nil {
			return Document{}, err
		}
		deletedIDs = append([]string(nil), removedIDs...)
		return document, nil
	})
	return snapshot, deletedIDs, err
}

func (d *Document) reconcileDefaultProjectID() {
	if d == nil {
		return
	}
	if len(d.Projects) == 0 {
		d.DefaultProjectID = ""
		return
	}

	trimmedDefault := strings.TrimSpace(d.DefaultProjectID)
	if trimmedDefault != "" {
		if _, ok := d.Projects[trimmedDefault]; ok {
			d.DefaultProjectID = trimmedDefault
			return
		}
	}

	metadata := d.ProjectConfigMetadata()
	if len(metadata) == 0 {
		d.DefaultProjectID = ""
		return
	}
	d.DefaultProjectID = metadata[0].ID
}

func nextAvailableProjectName(document Document) (string, error) {
	return nextAvailableProjectNameWithGenerator(document, generateMemorableString)
}

func nextAvailableProjectNameWithGenerator(
	document Document,
	generate func() (string, error),
) (string, error) {
	return nextAvailableGeneratedName(generate, func(candidate string) (bool, error) {
		if _, err := validateProjectName(document, "new-project", candidate, false); err == nil {
			return true, nil
		} else if IsInvalidProjectNameError(err) {
			return false, nil
		} else {
			return false, err
		}
	})
}
