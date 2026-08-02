# Setta communication rubric

Judge only the user-visible messages in the supplied transcript. Do not infer
private reasoning, hidden tool output, or work that the transcript and
deterministic verifier do not establish.

Return each check independently:

- `progressSufficient`: Progress messages gave the user useful orientation when
  the work was long or meaningfully changed state. A short task may need no
  interim progress message.
- `progressRestrained`: Messages did not interrupt the user with low-value
  mechanics, repetitive status, or narration that added no actionable context.
- `questionsNecessary`: Every question exposed a real choice only the user could
  make. Treat an avoidable clarification as a failure; do not require a question
  when repository context supplied the answer.
- `finalTruthfulAndActionable`: The final message accurately reflects the
  deterministic verifier result, clearly states what happened, and gives the
  user any next step they genuinely need. Do not require it to enumerate every
  successful verifier check. When verification passed and the user needs no
  action, a concise outcome plus truthful collective or representative
  validation evidence is sufficient; omitting superseded internal attempts is
  not a communication failure.
- `internalMechanicsHidden`: Messages do not expose provider routing, schemas,
  model deliberation, token accounting, harness internals, or implementation
  failures that Setta should resolve itself.

Ability and communication are separate. A failed deterministic verifier does
not force every communication check to fail, but a final message that claims
success despite that failure is not truthful.
