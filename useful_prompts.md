Compare the current branch with the main branch. Do the changes make sense? Is there redundant, unused, or inefficient code? Any unnecessary backward compatibility shims? Is there any reason I shouldn't merge the current branch into the main branch? Review only what this branch would add to main (diff vs merge base). Use git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Give succinct concrete examples for each finding, your proposed fix, and the UX/DX before and after your proposed fix.

Compare the current branch with the main branch. Review only what this branch would add to main (diff vs merge base) using git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Take into account fixes already made in cumulative_review.md and do not re-raise resolved issues unless this branch regresses them. Prioritize root-cause and invariant-level analysis over symptom-level comments: cluster related findings under shared root causes, and state the violated invariant for each cluster. For each finding, provide succinct concrete evidence, severity, merge risk, and two fix options: (1) a principled fix that removes the issue class (single source of truth, fail-fast invariants, no backward-compatibility shim), and (2) a minimal tactical fix only if needed now, explicitly labeled as tactical. Also include the UX/DX before and after the principled fix, and list regression tests that should be added/updated to prevent the same issue class from recurring.

Compare the current branch with the main branch. Review only what this branch would add to main (diff vs merge base). Use git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Then update the docs as necessary.

Read docs/mcp-multi-server-plan.md. Implement the plan. Remember we never need backward compatibility or legacy support! It's also ok for the application to be broken during this refactor! DO NOT KEEP CODE AROUND JUST TO KEEP THE CODE FUNCTIONAL. THIS IS A REFACTORING. WE EXPECT THE CODE TO BE BROKEN DURING THE REFACTOR.

Read docs/mcp-multi-server-plan.md. Read the code base. Is the plan fully implemented?

Implement the fixes. Add unit, integration, and playwright tests when appropriate. The CDP MCP server is already running and available for you to use, so do not try to start it up yourself, and you should not run pnpm start or pnpm reset.

Merge the main branch into our current branch. If there are merge conflicts, resolve them, and then afterwards explain your logic for how you resolved each conflict. All branches are up to date (no need to fetch).

Merge <> into main. In the commit message, include a detailed summary of what the <> branch does.

Read all the top-level review*.md docs. Present me the consolidated findings, including the proposed fixes, and the UX/DX before/after the proposed fixes. Exclude fixes that involve adding backward compatibility.

Read all the top-level review*.md docs. Present me the consolidated findings, including the proposed fixes, and the UX/DX before/after the proposed fixes. Exclude fixes that involve adding backward compatibility. Also, are the findings in conflict with our past fixes outlined in cumulative_review.md?

Read the diff of <commit hash>. Write a summary of the changes to a new doc called cumulative_review.md. We are going to be appending to this document in future commits with the same concept (writing a summary of changes of each commit), so put the summary under a heading with the commit hash in the heading.

See the latest github actions tests on the main branch. What are the all errors caused by? Can it be fixed? I also ran the tests locally, see the logs in tests-frontend.log.

Add a new entry to cumulative_review.md (use date time as the heading). Then commit all of that (including cumulative_review.md but excluding the review*.md docs). Remove all top-level review*.md files
