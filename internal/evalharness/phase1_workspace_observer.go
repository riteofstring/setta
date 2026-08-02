package evalharness

import (
	"context"
	"fmt"
	"strings"
	"time"

	"setta/internal/evalharness/workspaceevidence"
	"setta/internal/jsonio"
)

const phase1WorkspaceReadTimeout = 30 * time.Second

func (resources *phase1DockerResources) readWorkspaceDigest(
	ctx context.Context,
) (workspaceevidence.Digest, error) {
	readContext, cancel := context.WithTimeout(ctx, phase1WorkspaceReadTimeout)
	defer cancel()
	result, err := resources.client.run(
		readContext,
		"container", "exec",
		resources.volumeHolder,
		"/usr/local/bin/setta-eval-workspace-observer",
	)
	if err != nil {
		return workspaceevidence.Digest{}, fmt.Errorf("read Phase 1 workspace digest: %w", err)
	}
	var digest workspaceevidence.Digest
	if err := jsonio.DecodeSingle(strings.NewReader(result.stdout), &digest); err != nil {
		return workspaceevidence.Digest{}, fmt.Errorf("decode Phase 1 workspace digest: %w", err)
	}
	if err := digest.Validate(); err != nil {
		return workspaceevidence.Digest{}, fmt.Errorf("validate Phase 1 workspace digest: %w", err)
	}
	return digest, nil
}
