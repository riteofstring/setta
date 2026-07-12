package conversation

import "reflect"

type ContractTaggedUnion struct {
	Discriminator string
	Type          reflect.Type
	Branches      []ContractTaggedUnionBranch
}

type ContractTaggedUnionBranch struct {
	Field     string
	KindValue string
}
