package cli

import (
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
)

func stableID(value string) error {
	if strings.TrimSpace(value) == "" || value != strings.TrimSpace(value) || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("stable ID is invalid")
	}
	return nil
}

func sectionRoute(collectionPath string, id string, action string) (string, error) {
	if err := stableID(id); err != nil {
		return "", err
	}
	return collectionPath + "/" + url.PathEscape(id) + "/" + action, nil
}

type unknownOperationError struct{ name string }

func (unknownOperationError) Error() string { return "operation name is not supported" }

type projectRenameOperation struct{ name string }

func (operation projectRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectRenamePathV2, contracts.RenameProjectRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type callableCreateOperation struct{ name string }

func (operation callableCreateOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectCallablesPathV2, contracts.CreateCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type callableCreateConfiguredOperation struct {
	name            string
	expression      string
	parameterValues map[string]string
}

func (operation callableCreateConfiguredOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectConfiguredCallablePathV2, contracts.CreateConfiguredCallableRequestV2{
		ProjectID:          snapshot.Project.ID,
		ExpectedRevision:   snapshot.Project.Revision,
		Name:               operation.name,
		AuthoredExpression: operation.expression,
		ParameterValues:    operation.parameterValues,
	})
}

type callableRenameOperation struct{ id, name string }

func (operation callableRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "rename")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RenameCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type callableDeleteOperation struct{ id string }

func (operation callableDeleteOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "delete")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DeleteCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type callableCommitOperation struct{ id, expression string }

func (operation callableCommitOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "commit")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.CommitCallableRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, AuthoredExpression: operation.expression})
}

type callableRefreshParametersOperation struct{ id string }

func (operation callableRefreshParametersOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "refresh-parameters")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RefreshCallableParametersRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type callableSetParametersOperation struct {
	id         string
	parameters []contracts.ParameterProposalV2
}

func (operation callableSetParametersOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectCallablesPathV2, operation.id, "parameters")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.SetCallableParametersRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Parameters: operation.parameters})
}

type parameterDictionaryCreateOperation struct{ name string }

func (operation parameterDictionaryCreateOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectParameterDictionariesPathV2, contracts.CreateParameterDictionaryRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type parameterDictionaryRenameOperation struct{ id, name string }

func (operation parameterDictionaryRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectParameterDictionariesPathV2, operation.id, "rename")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RenameParameterDictionaryRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type parameterDictionaryDeleteOperation struct{ id string }

func (operation parameterDictionaryDeleteOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectParameterDictionariesPathV2, operation.id, "delete")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DeleteParameterDictionaryRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type parameterDictionarySetEntriesOperation struct {
	id      string
	entries []contracts.DictionaryEntryV2
}

func (operation parameterDictionarySetEntriesOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectParameterDictionariesPathV2, operation.id, "entries")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.SetParameterDictionaryEntriesRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Entries: operation.entries})
}

type listCreateOperation struct{ name string }

func (operation listCreateOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectListsPathV2, contracts.CreateListRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type listRenameOperation struct{ id, name string }

func (operation listRenameOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "rename")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.RenameListRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Name: operation.name})
}

type listDeleteOperation struct{ id string }

func (operation listDeleteOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "delete")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DeleteListRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision})
}

type listIncrementOperation struct {
	id    string
	count int
}

func (operation listIncrementOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "increment")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.IncrementListChildrenRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Count: operation.count})
}

type listDecrementOperation struct {
	id    string
	count int
}

func (operation listDecrementOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	path, err := sectionRoute(contracts.ProjectListsPathV2, operation.id, "decrement")
	if err != nil {
		return mutation{}, err
	}
	return validatedMutation(path, contracts.DecrementListChildrenRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Count: operation.count})
}

type forestReplaceOperation struct {
	topLevel     []string
	listChildren []contracts.ListChildrenV2
}

func (operation forestReplaceOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectForestPathV2, contracts.ReplaceSectionForestRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, TopLevelSectionIDs: operation.topLevel, ListChildren: operation.listChildren})
}

type pythonTargetSetOperation struct{ prefix, suffix string }

func (operation pythonTargetSetOperation) mutation(snapshot contracts.ProjectSnapshotV2) (mutation, error) {
	return validatedMutation(contracts.ProjectTargetPathV2, contracts.SetPythonTargetRequestV2{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Project.Revision, Prefix: operation.prefix, Suffix: operation.suffix})
}
