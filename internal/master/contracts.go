package master

import "reflect"

type ContractValueSet struct {
	Name   string
	Values []string
}

type ContractTaggedUnion struct {
	Discriminator string
	Type          reflect.Type
	Branches      []ContractTaggedUnionBranch
}

type ContractTaggedUnionBranch struct {
	Field     string
	KindValue string
}

func ContractTaggedUnions() []ContractTaggedUnion {
	return []ContractTaggedUnion{{
		Discriminator: "kind",
		Type:          reflect.TypeFor[RouteDecision](),
		Branches: []ContractTaggedUnionBranch{
			{Field: "sendToAgent", KindValue: string(RouteDecisionKindSendToAgent)},
			{Field: "queueAgentTurn", KindValue: string(RouteDecisionKindQueueAgentTurn)},
			{Field: "steerActiveTurn", KindValue: string(RouteDecisionKindSteerActiveTurn)},
			{Field: "askNarrator", KindValue: string(RouteDecisionKindAskNarrator)},
			{Field: "focusConversation", KindValue: string(RouteDecisionKindFocusConversation)},
			{Field: "createConversation", KindValue: string(RouteDecisionKindCreateConversation)},
			{Field: "createSideConversation", KindValue: string(RouteDecisionKindCreateSideConversation)},
			{Field: "forkConversation", KindValue: string(RouteDecisionKindForkConversation)},
			{Field: "clarify", KindValue: string(RouteDecisionKindClarify)},
			{Field: "answerGlobal", KindValue: string(RouteDecisionKindAnswerGlobal)},
		},
	}}
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
		{
			Name: "RouteDecisionKind",
			Values: []string{
				string(RouteDecisionKindSendToAgent),
				string(RouteDecisionKindQueueAgentTurn),
				string(RouteDecisionKindSteerActiveTurn),
				string(RouteDecisionKindAskNarrator),
				string(RouteDecisionKindFocusConversation),
				string(RouteDecisionKindCreateConversation),
				string(RouteDecisionKindCreateSideConversation),
				string(RouteDecisionKindForkConversation),
				string(RouteDecisionKindClarify),
				string(RouteDecisionKindAnswerGlobal),
			},
		},
		{
			Name: "InputRoutingStatus",
			Values: []string{
				string(InputRoutingStatusAccepted),
				string(InputRoutingStatusRouting),
				string(InputRoutingStatusDecided),
				string(InputRoutingStatusFailed),
			},
		},
	}
}
