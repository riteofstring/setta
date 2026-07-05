package chat

type fakeCodexState struct {
	approvalOutstanding  bool
	commandThreadResumed bool
	commandThreadStarted bool
	goalCleared          bool
	goalPaused           bool
	holdCalls            int
	interruptCalls       int
	modelListCalls       int
	parallelThreadSeq    int
	responseOutstanding  string
	currentThreadID      string
	skillRootsConfigured bool
}
