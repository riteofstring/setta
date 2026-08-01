package evalharness

import "testing"

func TestValidatePhase0TmpfsMountOptionsRequiresExactHardening(t *testing.T) {
	t.Parallel()

	reordered := "mode=1777,size=67108864,nodev,nosuid,noexec,rw"
	if err := validatePhase0TmpfsMountOptions(reordered); err != nil {
		t.Fatalf("reordered exact options were rejected: %v", err)
	}
	for _, invalid := range []string{
		"rw,noexec,nosuid,size=67108864,mode=1777",
		phase0ContainerTmpfsMountOptions() + ",exec",
		phase0ContainerTmpfsMountOptions() + ",rw",
	} {
		if err := validatePhase0TmpfsMountOptions(invalid); err == nil {
			t.Fatalf("invalid tmpfs options were accepted: %s", invalid)
		}
	}
}
