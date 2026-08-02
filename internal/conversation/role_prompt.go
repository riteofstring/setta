package conversation

// RolePromptSurface is one Setta-owned prompt surface supplied to a role.
// Product owners expose the assembled runtime text so diagnostics and evals
// inspect the exact contract rather than maintaining a source-code mirror.
type RolePromptSurface struct {
	Role    Role
	Surface string
	Prompt  string
}
