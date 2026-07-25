package main

import (
	"bytes"
	"fmt"
)

func renderMethodConstants(buffer *bytes.Buffer, prefix string, members []protocolMember) {
	renderProtocolMemberConstants(buffer, prefix, members)
	renderProtocolMemberValues(buffer, prefix+"Values", prefix, members)
}

func renderProtocolMemberConstants(buffer *bytes.Buffer, prefix string, members []protocolMember) {
	buffer.WriteString("const (\n")
	for _, member := range members {
		fmt.Fprintf(buffer, "\t%s%s = %q\n", prefix, member.ConstName, member.Method)
	}
	buffer.WriteString(")\n\n")
}

func renderProtocolMemberValues(buffer *bytes.Buffer, name string, prefix string, members []protocolMember) {
	fmt.Fprintf(buffer, "var %s = []string{\n", name)
	for _, member := range members {
		fmt.Fprintf(buffer, "\t%s%s,\n", prefix, member.ConstName)
	}
	buffer.WriteString("}\n\n")
}

// renderUpstreamNotificationMethods emits every server notification method in the
// checked-in protocol snapshot, including methods Setta does not register. Only
// registered methods get constants and decoders; this list exists so the provider
// notification adapter matrix can prove it classifies the whole upstream surface.
func renderUpstreamNotificationMethods(buffer *bytes.Buffer, members []protocolMember) {
	buffer.WriteString("// CodexUpstreamNotificationValues lists every server notification method in the\n")
	buffer.WriteString("// checked-in Codex protocol snapshot, including unregistered methods.\n")
	buffer.WriteString("var CodexUpstreamNotificationValues = []string{\n")
	for _, member := range members {
		fmt.Fprintf(buffer, "\t%q,\n", member.Method)
	}
	buffer.WriteString("}\n\n")
}
