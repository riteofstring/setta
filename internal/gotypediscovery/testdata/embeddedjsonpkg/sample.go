package embeddedjsonpkg

type TaggedFields struct {
	Name string `json:"name"`
}

type EmbeddedOnlyStruct struct {
	TaggedFields
}

type UntaggedEmbeddedFields struct {
	Name string
}

type UntaggedEmbeddedOnlyStruct struct {
	UntaggedEmbeddedFields
}
