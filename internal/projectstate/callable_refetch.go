package projectstate

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

type callableRefetchTarget struct {
	SectionID    string
	CallableID   string
	CallableName string
}

func (d *Document) RefetchCallableParams(
	ctx context.Context,
	projectID string,
	sectionIDs []string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return false, err
	}
	didUpdate, err := project.RefetchCallableParams(ctx, sectionIDs, resolver)
	if err != nil {
		return false, err
	}
	d.Projects[project.ID] = project
	return didUpdate, nil
}

func (r *Runtime) RefetchCallableParams(
	ctx context.Context,
	projectID string,
	sectionIDs []string,
	resolver CallableSignatureResolver,
) (Snapshot, bool, error) {
	if r == nil {
		return Snapshot{}, false, ErrRuntimeClosed
	}

	var didUpdate bool
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		didUpdate, mutationErr = document.RefetchCallableParams(ctx, projectID, sectionIDs, resolver)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, false, err
	}
	return snapshot, didUpdate, nil
}

func (p *Project) RefetchCallableParams(
	ctx context.Context,
	sectionIDs []string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}

	targets, err := p.collectCallableRefetchTargets(sectionIDs)
	if err != nil {
		return false, err
	}
	if len(targets) == 0 {
		return false, nil
	}

	didUpdate := false
	for _, target := range targets {
		response, err := p.SetCallable(ctx, target.SectionID, target.CallableName, true, resolver)
		if err != nil {
			return false, err
		}
		responseCallableID := ""
		if response.CallableID != nil {
			responseCallableID = strings.TrimSpace(*response.CallableID)
		}
		if response.LSPStatus != SignatureHelpStatusSkipped || responseCallableID != target.CallableID {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p Project) collectCallableRefetchTargets(sectionIDs []string) ([]callableRefetchTarget, error) {
	trimmedSectionIDs := uniqueSortedTrimmedStrings(sectionIDs)
	targets := make([]callableRefetchTarget, 0, len(trimmedSectionIDs))

	for _, sectionID := range trimmedSectionIDs {
		if _, ok := p.Sections[sectionID]; !ok {
			continue
		}
		sectionPayload, err := p.currentCallableSectionPayload(sectionID)
		if err != nil {
			if errors.Is(err, ErrCallableSectionRequired) {
				continue
			}
			return nil, err
		}

		callableID := payloadStringField(sectionPayload, "callable")
		if callableID == "" {
			continue
		}
		codeObj, ok := p.CodeObjs[callableID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
		}
		callableName := strings.TrimSpace(codeObj.Name)
		if callableName == "" {
			continue
		}
		targets = append(targets, callableRefetchTarget{
			SectionID:    sectionID,
			CallableID:   callableID,
			CallableName: callableName,
		})
	}

	return targets, nil
}

func uniqueSortedTrimmedStrings(values []string) []string {
	seen := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		seen[trimmed] = struct{}{}
	}
	output := make([]string, 0, len(seen))
	for value := range seen {
		output = append(output, value)
	}
	sort.Strings(output)
	return output
}
