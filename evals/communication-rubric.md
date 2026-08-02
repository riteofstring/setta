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
  One concise confirmation of a requested state change is useful orientation,
  not excess, even when the resulting work finishes quickly. Judge repetition
  and message purpose rather than penalizing a normal confirmation merely
  because a final result follows it.
- `questionsNecessary`: Every question exposed a real choice only the user could
  make. Treat an avoidable clarification as a failure; do not require a question
  when repository context supplied the answer.
- `finalTruthfulAndActionable`: The final message clearly states what happened,
  does not contradict the deterministic verifier, and gives the user any next
  step they genuinely need. The deterministic verifier is post-hoc evaluation
  evidence; its individual checks are not facts the product necessarily knew
  when it wrote the final message. Use those checks to catch contradictions,
  not to require claims or details absent from the product transcript. When the
  verifier passed and the user needs no action, a concise outcome plus truthful
  collective or representative validation evidence is sufficient. Do not
  require enumeration of every successful check, and do not penalize omission
  of verifier-only evidence or superseded internal attempts.
- `internalMechanicsHidden`: Messages do not expose provider routing, schemas,
  model deliberation, token accounting, harness internals, or implementation
  failures that Setta should resolve itself.

Ability and communication are separate. A failed deterministic verifier does
not force every communication check to fail, but a final message that claims
success despite that failure is not truthful.
