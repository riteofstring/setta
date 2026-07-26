// Package artifactdoc owns Setta's static OpenUI Lang profile: the grammar the
// backend accepts, the component catalog the model may compose from, and the
// compiler that turns accepted source into a rendered component tree.
//
// This is the Phase 0 feasibility spike for the OpenUI artifact system plan.
// Nothing in the production artifact contract, schema, tool, or renderer imports
// it yet. The point of the spike is to prove the gate the plan sets: that Go can
// validate the complete supported profile on its own, with no renderer, no
// JavaScript runtime, and no network service.
//
// # Grammar
//
// A document is a sequence of assignment statements. Statements never share a
// line; a statement may wrap across lines only while a bracket is open.
//
//	document      = { newline } , statement , { newline , { newline } , statement } , { newline } ;
//	statement     = identifier , "=" , expression ;
//	expression    = component | reference | string | number | boolean | null | array | object ;
//	component     = identifier , "(" , [ arguments ] , ")" ;
//	arguments     = expression , { "," , expression } , [ "," ] ;
//	reference     = identifier ;
//	array         = "[" , [ expression , { "," , expression } , [ "," ] ] , "]" ;
//	object        = "{" , [ member , { "," , member } , [ "," ] ] , "}" ;
//	member        = ( identifier | string ) , ":" , expression ;
//	identifier    = ( letter | "_" ) , { letter | digit | "_" } ;
//	string        = '"' , { character | escape } , '"' ;
//	number        = [ "-" ] , int , [ frac ] , [ exp ] ;
//	int           = "0" | nonzero , { digit } ;
//	frac          = "." , digit , { digit } ;
//	exp           = ( "e" | "E" ) , [ "+" | "-" ] , digit , { digit } ;
//	boolean       = "true" | "false" ;
//	null          = "null" ;
//
// Profile decisions the grammar alone does not carry:
//
//   - Component arguments are positional and are mapped through the catalog's
//     ordered properties. Named arguments are rejected, not guessed at.
//   - A trailing optional argument may be omitted, or passed as null to skip it
//     and reach a later one. null in a required slot is a failure.
//   - Exactly one statement must be named root, and its value must be a direct
//     Document call. Every other statement must be reachable from root.
//   - References may point forward or backward and may be shared, so the
//     resolved document is a tree over a statement DAG. Cycles are rejected.
//   - A newline inside an open "(", "[", or "{" is whitespace. Everywhere else
//     it ends the statement.
//   - Comments, string interpolation, single-quoted strings, arithmetic,
//     conditionals, state, bindings, patches, and OpenUI's Query, Mutation,
//     Action, and tool built-ins are all outside the profile.
//
// # What the compiler guarantees
//
// Compile accepts source only when every statement parses, every reference
// resolves, every component is registered in the active catalog, every argument
// matches its declared type, every string passes the safety rules for its role,
// and the document fits inside the Go-owned limits. Failures come back as
// structured diagnostics carrying a stable code, position, statement, component,
// property, and a concise correction instruction, which is the shape the
// dynamic-tool retry path needs.
//
// The compiled tree is plain JSON data: strings, finite numbers, booleans,
// arrays, objects, and nodes. It exists so the same document can be compared
// against the pinned upstream OpenUI parser, and so previews and the artifact
// browser render from one validated shape.
package artifactdoc
