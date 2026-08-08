package realtime

func FrontendDefaultConnection() Connection {
	return Connection{
		Type: ConnectionTypeServer,
	}
}
