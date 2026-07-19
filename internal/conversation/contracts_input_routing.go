package conversation

import "reflect"

func conversationInputContractTaggedUnions() []ContractTaggedUnion {
	branches := []ContractTaggedUnionBranch{
		{Field: "sendToParent", KindValue: string(ConversationRouteDecisionKindSendToParent)},
		{Field: "queueParentTurn", KindValue: string(ConversationRouteDecisionKindQueueParentTurn)},
		{Field: "steerParentTurn", KindValue: string(ConversationRouteDecisionKindSteerParentTurn)},
		{Field: "answerAsNarrator", KindValue: string(ConversationRouteDecisionKindAnswerAsNarrator)},
		{Field: "createSideConversation", KindValue: string(ConversationRouteDecisionKindCreateSideConversation)},
		{Field: "forkConversation", KindValue: string(ConversationRouteDecisionKindForkConversation)},
		{Field: "escalateToMaster", KindValue: string(ConversationRouteDecisionKindEscalateToMaster)},
		{Field: "clarify", KindValue: string(ConversationRouteDecisionKindClarify)},
	}
	return []ContractTaggedUnion{
		{
			Discriminator: "kind",
			Type:          reflect.TypeFor[ConversationRouteDecision](),
			Branches:      branches,
		},
		{
			Discriminator: "kind",
			Type:          reflect.TypeFor[ConversationRouteCommand](),
			Branches:      branches,
		},
	}
}

func conversationInputContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		contractValueSet("ConversationInputModality", ConversationInputModalityText, ConversationInputModalityVoice),
		contractValueSet("ConversationInputStatus", ConversationInputStatusAccepted, ConversationInputStatusRouting, ConversationInputStatusAwaitingClarification, ConversationInputStatusDispatched, ConversationInputStatusFailed),
		contractValueSet("ConversationRouteDecisionKind", ConversationRouteDecisionKindSendToParent, ConversationRouteDecisionKindQueueParentTurn, ConversationRouteDecisionKindSteerParentTurn, ConversationRouteDecisionKindAnswerAsNarrator, ConversationRouteDecisionKindCreateSideConversation, ConversationRouteDecisionKindForkConversation, ConversationRouteDecisionKindEscalateToMaster, ConversationRouteDecisionKindClarify),
		contractValueSet("ConversationRouteDecisionAuthority", ConversationRouteDecisionAuthorityNarratorModel, ConversationRouteDecisionAuthorityProductInvariant),
	}
}
