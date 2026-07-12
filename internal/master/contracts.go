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
	decisionBranches := []ContractTaggedUnionBranch{
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
	}
	return []ContractTaggedUnion{{
		Discriminator: "kind",
		Type:          reflect.TypeFor[RouteDecision](),
		Branches:      decisionBranches,
	}, {
		Discriminator: "kind",
		Type:          reflect.TypeFor[RouteCommand](),
		Branches:      decisionBranches,
	}, {
		Discriminator: "kind",
		Type:          reflect.TypeFor[PresentationIntent](),
		Branches: []ContractTaggedUnionBranch{
			{Field: "focusExistingConversationPane", KindValue: string(PresentationIntentKindFocusExistingConversationPane)},
			{Field: "openConversationPane", KindValue: string(PresentationIntentKindOpenConversationPane)},
			{Field: "openSideConversation", KindValue: string(PresentationIntentKindOpenSideConversation)},
			{Field: "showMasterReply", KindValue: string(PresentationIntentKindShowMasterReply)},
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
		{
			Name: "PresentationIntentKind",
			Values: []string{
				string(PresentationIntentKindFocusExistingConversationPane),
				string(PresentationIntentKindOpenConversationPane),
				string(PresentationIntentKindOpenSideConversation),
				string(PresentationIntentKindShowMasterReply),
			},
		},
		{
			Name: "MasterReplyKind",
			Values: []string{
				string(MasterReplyKindClarification),
				string(MasterReplyKindAnswer),
			},
		},
	}
}
