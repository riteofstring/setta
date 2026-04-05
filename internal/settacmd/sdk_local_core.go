package settacmd

import (
	"fmt"
	"io"

	"setta/internal/pythonsdklocalcore"
)

func runSDKLocalCore(args []string, stdin io.Reader, stdout io.Writer) error {
	if len(args) != 0 {
		return fmt.Errorf("sdk-local-core does not accept arguments")
	}
	return pythonsdklocalcore.Run(pythonsdklocalcore.RunOptions{
		Stdin:  stdin,
		Stdout: stdout,
	})
}
