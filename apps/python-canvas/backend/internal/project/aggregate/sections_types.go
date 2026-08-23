package aggregate

// ParameterDictionary is one authored dictionary section. Its entries are a
// recursive strict union so a node can be either an expression leaf or a
// nested dictionary parent, never both.
type ParameterDictionary struct {
	ID      string
	Name    string
	Entries []DictionaryEntry
}

// DictionaryEntry is the recursive item-tree node owned by a parameter
// dictionary. Exactly one of Leaf and Parent must be set.
type DictionaryEntry struct {
	ID     string
	Name   string
	Leaf   *DictionaryLeaf
	Parent *DictionaryParent
}

// DictionaryLeaf contains an authored Python expression. An empty expression
// is valid while the row is being authored.
type DictionaryLeaf struct {
	AuthoredExpression string
}

// DictionaryParent contains an ordered nested dictionary. An empty parent is
// valid after its final child is moved away.
type DictionaryParent struct {
	Children []DictionaryEntry
}

// List is an authored List of Objects section and owns its ordered direct
// child section IDs.
type List struct {
	ID              string
	Name            string
	ChildSectionIDs []string
}

// CreateParameterDictionaryCommand appends one empty Parameter Dictionary to
// the top-level section forest.
type CreateParameterDictionaryCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

// RenameParameterDictionaryCommand changes one Parameter Dictionary display
// name without changing its entries.
type RenameParameterDictionaryCommand struct {
	ProjectID        string
	DictionaryID     string
	ExpectedRevision int
	Name             string
}

// DeleteParameterDictionaryCommand removes a Parameter Dictionary section.
type DeleteParameterDictionaryCommand struct {
	ProjectID        string
	DictionaryID     string
	ExpectedRevision int
}

// SetParameterDictionaryEntriesCommand replaces one complete recursive entry
// tree through one expected-revision mutation.
type SetParameterDictionaryEntriesCommand struct {
	ProjectID        string
	DictionaryID     string
	ExpectedRevision int
	Entries          []DictionaryEntry
	// UIOverrides contains only non-default leaf presentations keyed by entry ID.
	UIOverrides map[string]ParameterUI
}

// CreateListCommand appends one empty List of Objects to the top-level forest.
type CreateListCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

// RenameListCommand changes one List of Objects display name.
type RenameListCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
	Name             string
}

// DeleteListCommand removes a List of Objects and its complete child subtree.
type DeleteListCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
}

// IncrementListChildrenCommand atomically appends Count empty Callable
// sections to a List of Objects.
type IncrementListChildrenCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
	Count            int
}

// DecrementListChildrenCommand removes up to Count trailing List of Objects
// child subtrees atomically.
type DecrementListChildrenCommand struct {
	ProjectID        string
	ListID           string
	ExpectedRevision int
	Count            int
}

// ListChildrenProposal supplies the ordered children for exactly one existing
// List of Objects during a complete forest replacement.
type ListChildrenProposal struct {
	ListID          string
	ChildSectionIDs []string
}

// ReplaceSectionForestCommand changes only top-level and List child order. It
// cannot modify typed section payloads in the same mutation.
type ReplaceSectionForestCommand struct {
	ProjectID          string
	ExpectedRevision   int
	TopLevelSectionIDs []string
	ListChildren       []ListChildrenProposal
}
