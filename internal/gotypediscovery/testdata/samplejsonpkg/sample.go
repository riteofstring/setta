package samplejsonpkg

type TaggedStruct struct {
	Name string `json:"name"`
}

type UntaggedStruct struct {
	Name string
}

type EmptyStruct struct{}

type TaggedString string
