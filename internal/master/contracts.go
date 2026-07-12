package master

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{
			Name: "MasterInputModality",
			Values: []string{
				string(MasterInputModalityText),
				string(MasterInputModalityVoice),
			},
		},
		{
			Name: "MasterInputSource",
			Values: []string{
				string(MasterInputSourceShell),
				string(MasterInputSourceConversationEscalation),
			},
		},
	}
}
