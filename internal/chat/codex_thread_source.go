package chat

const (
	codexThreadSourceSettaUser                 = "setta:user"
	codexThreadSourceSettaWorkflow             = "setta:workflow"
	codexThreadSourceSettaSemanticCartographer = "setta:semantic_cartographer"
)

func codexThreadSourceForConversation(conversation Conversation) string {
	if conversation.Internal || conversation.Workflow != nil {
		return codexThreadSourceSettaWorkflow
	}
	return codexThreadSourceSettaUser
}
