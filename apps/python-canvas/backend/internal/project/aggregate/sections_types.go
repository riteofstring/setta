package aggregate

type ParameterDictionary struct {
	ID      string
	Name    string
	Entries []DictionaryEntry
}

type DictionaryEntry struct {
	ID     string
	Name   string
	Leaf   *DictionaryLeaf
	Parent *DictionaryParent
}

type DictionaryLeaf struct {
	AuthoredExpression string
}

type DictionaryParent struct {
	Children []DictionaryEntry
}

type List struct {
	ID              string
	Name            string
	ChildSectionIDs []string
}

type CreateParameterDictionaryCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

type RenameParameterDictionaryCommand struct {
	ProjectID        string
	DictionaryID     string
	ExpectedRevision int
	Name             string
}

type DeleteParameterDictionaryCommand struct {
	ProjectID        string
	DictionaryID     string
	ExpectedRevision int
}

type SetParameterDictionaryEntriesCommand struct {
	ProjectID        string
	DictionaryID     string
	ExpectedRevision int
	Entries          []DictionaryEntry

	UIOverrides map[string]ParameterUI
}

type CreateListCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

type RenameListCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
	Name             string
}

type DeleteListCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
}

type IncrementListChildrenCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
	Count            int
}

type DecrementListChildrenCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
	Count            int
}

type ListChildrenProposal struct {
	ListID          string
	ChildSectionIDs []string
}

type ReplaceSectionForestCommand struct {
	ProjectID          string
	ExpectedRevision   int
	TopLevelSectionIDs []string
	ListChildren       []ListChildrenProposal
}
