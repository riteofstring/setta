package runtimeprovider

import (
	"context"
	"net"
)

// PrivateAccessDialer opens a provider-authenticated connection to a service
// that is not exposed through a public runtime URL. Implementations must keep
// provider credentials inside the transport and never add them to the inner
// application protocol.
type PrivateAccessDialer interface {
	DialPrivateRuntime(context.Context, string, string, string) (net.Conn, error)
}
