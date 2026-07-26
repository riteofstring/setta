package conversation

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Where one conversation's work runs.
//
// A Setta workspace is the user's own folder. It is optional context: it is what
// authorizes reading their files, and nothing else depends on it. The directory
// the provider process runs in is a different thing entirely — the provider
// runtime needs a working directory for every turn, including a turn about
// content that has nothing to do with the user's files.
//
// Conflating the two is what made every executable turn need a folder. Keeping
// them apart is what lets an unbound conversation run: it gets a private
// Setta-owned working directory, which is never registered as a workspace, never
// shown to the user, and never authorizes a file reference.

// unboundWorkingDirectoryName is the Setta-owned parent of the private
// directories unbound conversations run in. It sits beside the conversation
// state directory rather than inside any workspace, because nothing in it
// belongs to the user's files.
const unboundWorkingDirectoryName = "unbound-conversations"

// conversationExecutionScope is the resolved answer to "where does this
// conversation's work run, and what may it read".
type conversationExecutionScope struct {
	// workspaceID is the authorized workspace the conversation is bound to, or
	// nil when it is unbound.
	workspaceID *string
	// authorizedRoot is the only root a FileReference may resolve inside. It is
	// empty for an unbound conversation, which authorizes nothing.
	authorizedRoot string
	// workingDirectory is the directory the provider process runs in. It is an
	// execution detail: for a bound conversation it happens to be the authorized
	// workspace, and for an unbound one it is a private Setta-owned directory
	// that is not a workspace.
	workingDirectory string
}

// resolveExecutionScope resolves where one conversation's next turn runs. A
// bound conversation resolves through the workspace registry, so work still only
// ever runs in a folder the app is actively offering. An unbound conversation
// resolves to its own private directory instead of being refused.
func (service *Service) resolveExecutionScope(
	conversationID string,
	workspaceID *string,
) (conversationExecutionScope, error) {
	if workspaceID == nil {
		directory, err := service.unboundWorkingDirectory(conversationID)
		if err != nil {
			return conversationExecutionScope{}, err
		}
		return conversationExecutionScope{workingDirectory: directory}, nil
	}
	summary, err := service.workspaces.ResolveActiveWorkspace(*workspaceID)
	if err != nil {
		return conversationExecutionScope{}, err
	}
	return conversationExecutionScope{
		workspaceID:      cloneStringPointer(workspaceID),
		authorizedRoot:   summary.RootPath,
		workingDirectory: summary.RootPath,
	}, nil
}

// unboundWorkingDirectory is the private directory one unbound conversation's
// turns run in. It is per conversation so two unbound conversations cannot see
// each other's scratch work, and it is created on demand because a conversation
// that never runs a turn needs no directory at all.
func (service *Service) unboundWorkingDirectory(conversationID string) (string, error) {
	if err := validateWorkingDirectorySegment(conversationID); err != nil {
		return "", err
	}
	if service.store == nil || service.store.appDataDir == "" {
		return "", fmt.Errorf(
			"conversation %s has no app-owned location to run an unbound turn in",
			conversationID,
		)
	}
	directory := filepath.Join(service.store.appDataDir, unboundWorkingDirectoryName, conversationID)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", &PersistenceError{
			Operation: "create private conversation working directory",
			Path:      directory,
			Err:       err,
		}
	}
	return directory, nil
}

// validateWorkingDirectorySegment proves a Setta id can name a directory. Ids
// are minted by trusted code, so anything else here is a bug rather than a
// caller mistake, and it fails loudly instead of resolving somewhere else on
// disk.
func validateWorkingDirectorySegment(conversationID string) error {
	if err := validateIdentifier("private working directory conversation id", conversationID); err != nil {
		return err
	}
	if conversationID == "." || conversationID == ".." ||
		strings.ContainsAny(conversationID, `/\`) ||
		strings.ContainsRune(conversationID, filepath.Separator) {
		return fmt.Errorf("conversation id %q cannot name a private working directory", conversationID)
	}
	return nil
}
