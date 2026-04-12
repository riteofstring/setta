//go:build aix || solaris

package terminals

func suppressPromptReadyEcho(session *session) (func(), error) {
	return nil, nil
}
