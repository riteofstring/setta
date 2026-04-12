package localnamedpkg

type TaggedStruct struct {
	ID string `json:"id"`
}

type TaggedNamed TaggedStruct

type TaggedAlias = TaggedStruct

type TaggedNamedChain TaggedNamed
