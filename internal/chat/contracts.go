package chat

import "reflect"

type ContractUnion struct {
	Discriminator string
	Name          string
	Type          reflect.Type
	Variants      []ContractUnionVariant
}

type ContractUnionVariant struct {
	KindValue string
	Name      string
	Type      reflect.Type
}

func ContractUnions() []ContractUnion {
	return []ContractUnion{
		{
			Discriminator: "kind",
			Name:          "ChatCommandArgumentSpec",
			Type:          reflect.TypeFor[ChatCommandArgumentSpec](),
			Variants: []ContractUnionVariant{
				{
					KindValue: string(ChatCommandArgumentLiteral),
					Name:      "ChatCommandLiteralArgumentSpec",
					Type:      reflect.TypeFor[ChatCommandLiteralArgumentSpec](),
				},
				{
					KindValue: string(ChatCommandArgumentFreeText),
					Name:      "ChatCommandFreeTextArgumentSpec",
					Type:      reflect.TypeFor[ChatCommandFreeTextArgumentSpec](),
				},
			},
		},
	}
}
