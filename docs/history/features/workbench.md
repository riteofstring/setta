# The programmable workbench

**Historical application.** Setta expanded into a place to work with files, repositories,
remote environments, tasks and agents. Connected context and executable workflows made the
canvas part of how work ran, while views and app mode made it possible to expose a smaller
surface to another person.

![Experiment results connected to two Setta chats.](../../../images/history/setta-connected-chats.png)

_Restored March 2026 build with a new demonstration project and substitute local model.
The chats consume connected results; the provider session is newly restored._

**Experiments:** the hosted service, later share deployments and app generation represent
separate approaches to distribution. They should not be read as one continuous hosted product.
**Current library:** the generic workspace survives; Git, SSH, task management and external
agents are historical application integrations, not bundled services in today's package.

## Give each conversation a role

Chats could branch from edited messages and keep the alternatives visible. Canvas links
then connected conversations to the material they should inspect or change. A section-to-chat
link supplied read access and context; a chat-to-section link granted read/write scope.
Context could be a reference, an excerpt or a cached summary.

The [agentic-edge implementation](https://github.com/riteofstring/setta/commit/2468b2d36433e138d3e4c52b6abc790c4886d3a6)
made those relationships operational. A later
[linked-chat bridge](https://github.com/riteofstring/setta/blob/f347b886ac7f4273b220e57bbce30360955c4efd/backend/setta/agentic/linked_chat_invocation.py)
let one conversation invoke a directly connected peer and receive its result. That version
allowed one level of invocation and bounded the returned text.

## Turn conversations into a workflow

![Two reviewers receive an experiment, complete their responses and satisfy the AND gate in a Start-to-End workflow.](../../../images/history/setta-model-workbench.png)

**Start two reviews, then wait for both.** Workflow connections could dispatch chats,
react to completed or failed runs, or route a structured signal. AND, OR and XOR gates
determined when the next step could proceed. Start, stop and reset controls and visible
gate progress made execution inspectable on the same canvas.

The [March 2026 runner](https://github.com/riteofstring/setta/blob/1f435b942c7d2860b368f34d91cf6fe1cd7becea/backend/setta/agentic/state_machine_runner.py)
executed those graphs. Prompt sections later provided editable or saved-template-backed
instructions, which workflow edges could resolve when dispatching a chat.

_Restored May 2026 build with a new demonstration project. The two responses completed
through the application using a substitute local Qwen model. The measured experiment was
included in the prompts; the picture does not establish link-only context delivery.
[Image provenance](../images.md) records the restoration._

## Keep the evidence beside the work

Files, Python, Git diffs, repository graphs and editable CSV/XLSX data could share the
workspace with research notes and task boards. Named views changed which sections were
visible and how they were arranged: Analyze could foreground code and measurements,
while Plan brought tasks and decisions forward over the same project.

Floating and docked conversations added another kind of arrangement. Saved **window spaces**
retained window layouts, with standalone routes for opening them again. These were separate
from the canvas's named views. The [March 2026 windowing changes](https://github.com/riteofstring/setta/commit/f75bef87614f0651b15af57e16117dd60522ae7b)
also brought Git Graph into that presentation system.

The workbench briefly tried dedicated Clock and Calendar sections on February 14, 2026.
They were [removed the following day](https://github.com/riteofstring/setta/commit/d7a63e1f68c7a839587990414f5676ec5b51c490);
calendar and time selection became
[text and meta-control modes](https://github.com/riteofstring/setta/commit/01d3c59cf2b960e129c5dea4584ffe137f1e81b1).
Task boards and spreadsheets continued as dedicated sections.

## Implementation landmarks

These are preserved implementation landmarks, not a release calendar.

| Month   | Preserved work                                                                           | Source                                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-05 | The separate SaaS experiment deploys projects through Fly Machines.                      | [Change](https://github.com/riteofstring/setta/commit/714290e028dcef6d83d5ac6649b8223b107e7b33)                                                                                                               |
| 2025-12 | Later share deployments introduce another publishing model.                              | [Change](https://github.com/riteofstring/setta/commit/8b4ee8d7122b0efb2fa59efd597b1ceefffcb4d0)                                                                                                               |
| 2026-01 | Name/version routing develops share deployment addressing.                               | [Change](https://github.com/riteofstring/setta/commit/2eba48c6436edaec29908d37412cd7bafaf4bd23)                                                                                                               |
| 2026-01 | An agentic runner provides a foundation for external coding agents.                      | [Change](https://github.com/riteofstring/setta/commit/836cb0ba72152f069190f532ad6c365b305eefb2)                                                                                                               |
| 2026-01 | A file explorer joins the workspace.                                                     | [Change](https://github.com/riteofstring/setta/commit/2961e37d0a6dab5e7c83b668c247ba30bf1e7edd)                                                                                                               |
| 2026-02 | Edited messages can branch a conversation, with nested branches shown in chat.           | [Branching](https://github.com/riteofstring/setta/commit/165ad31a57b7bf43e977aebc87075c962587a204) · [Nested branches](https://github.com/riteofstring/setta/commit/ec331e59377643afbff33271aad10d0996f0a449) |
| 2026-02 | App mode turns project state into a user-facing application surface.                     | [Change](https://github.com/riteofstring/setta/commit/bc0989e379aca4581368bc5104ac45786161bd19)                                                                                                               |
| 2026-02 | AI app-spec generation develops that application-creation direction.                     | [Change](https://github.com/riteofstring/setta/commit/cf9fe3fbe4d4bd9dc167a79cf45338ddadcd0a7c)                                                                                                               |
| 2026-02 | SSH workspaces extend the development environment to remote machines.                    | [Change](https://github.com/riteofstring/setta/commit/ae708854b1fc5d9db79966ebdabbf9f0f43835c4)                                                                                                               |
| 2026-02 | Git diff and graph interfaces make repository work visible.                              | [Change](https://github.com/riteofstring/setta/commit/d95c966bd0dbeedb0e4d421391434569db9f3ed9)                                                                                                               |
| 2026-02 | Plugin management introduces extensible workspace behavior.                              | [Change](https://github.com/riteofstring/setta/commit/7beab4e61d4fe3e6cc928faae0c7a369ac45d7d9)                                                                                                               |
| 2026-02 | A plugin CLI supports extension development.                                             | [Change](https://github.com/riteofstring/setta/commit/d768b4e425f441909dc99acf510fc359f4d10c22)                                                                                                               |
| 2026-02 | CSV and XLSX authoring bring spreadsheet data into the workbench.                        | [Change](https://github.com/riteofstring/setta/commit/69e253ded2b29963f7023a46346041651868fc28)                                                                                                               |
| 2026-02 | Task lists, Kanban and spreadsheet sections broaden the workspace.                       | [List modes](https://github.com/riteofstring/setta/commit/67c7b3d9cd0fe1ecca0ac09df70ed3090a93bb68) · [Sections](https://github.com/riteofstring/setta/commit/8d8729e5aa4598b27041925f0b73862a94f2f6e2)       |
| 2026-02 | Calendar and time controls replace the short-lived dedicated Clock/Calendar sections.    | [Change](https://github.com/riteofstring/setta/commit/01d3c59cf2b960e129c5dea4584ffe137f1e81b1)                                                                                                               |
| 2026-02 | Dictation adds another input path.                                                       | [Change](https://github.com/riteofstring/setta/commit/e46c1267f27aac4e2b8c085c1875aa7f4c4e1de0)                                                                                                               |
| 2026-03 | Linked chats support bounded invocation between conversations.                           | [Change](https://github.com/riteofstring/setta/commit/f347b886ac7f4273b220e57bbce30360955c4efd)                                                                                                               |
| 2026-03 | Workflow edges, inspectors and run controls develop executable graphs.                   | [Change](https://github.com/riteofstring/setta/commit/8d9b5b5fba1375648fd8ca75e101956e0d1dd0ed)                                                                                                               |
| 2026-03 | Start-edge actions execute chats from workflow connections.                              | [Change](https://github.com/riteofstring/setta/commit/d4c99108f3267bcd64a88653f0b4589b406d08fb)                                                                                                               |
| 2026-03 | Chat results flow through AND, OR and XOR gates.                                         | [Change](https://github.com/riteofstring/setta/commit/1f435b942c7d2860b368f34d91cf6fe1cd7becea)                                                                                                               |
| 2026-03 | Saved window spaces retain floating layouts and integrate Git Graph.                     | [Change](https://github.com/riteofstring/setta/commit/f75bef87614f0651b15af57e16117dd60522ae7b)                                                                                                               |
| 2026-03 | Prompt sections link to saved templates and supply instructions to workflow actions.     | [Templates](https://github.com/riteofstring/setta/commit/f45ac534938934bc01d01fd42a8bbda006612252) · [Dispatch](https://github.com/riteofstring/setta/commit/f433bf59d1b0276536514c57a3e4de9e8602f88a)        |
| 2026-03 | The Go backend migration begins; it is a different phase from the final browser library. | [Change](https://github.com/riteofstring/setta/commit/1db3317abf1d6fdcb288f67649c0f2744ea01018)                                                                                                               |

[Historical guide](../README.md) · [Repository composition](../timeline.md)
