Compare the current branch with the main branch. Do the changes make sense? Is there redundant, unused, or inefficient code? Any unnecessary backward compatibility shims? Is there any reason I shouldn't merge the current branch into the main branch? Review only what this branch would add to main (diff vs merge base). Use git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Give succinct concrete examples for each finding, your proposed fix, and the UX/DX before and after your proposed fix.



Compare the current branch with the main branch. Review only what this branch would add to main (diff vs merge base). Use git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Then update the docs as necessary.



Read docs/mcp-multi-server-plan.md. Implement the plan. Remember we never need backward compatibility or legacy support! It's also ok for the application to be broken during this refactor! DO NOT KEEP CODE AROUND JUST TO KEEP THE CODE FUNCTIONAL. THIS IS A REFACTORING. WE EXPECT THE CODE TO BE BROKEN DURING THE REFACTOR.



Read docs/mcp-multi-server-plan.md. Read the code base. Is the plan fully implemented?



Implement the fixes. Add unit, integration, and playwright tests when appropriate.



Merge the main branch into our current branch. If there are merge conflicts, resolve them, and then afterwards explain your logic for how you resolved each conflict. All branches are up to date (no need to fetch).


Merge <> into main. In the commit message, include a detailed summary of what the <> branch does.



Read all the top-level review*.md docs. Present me the consolidated findings, including the proposed fixes, and the UX/DX before/after the proposed fixes. Exclude fixes that involve adding backward compatibility.


I ran a bunch of tests, I think there are some errors. See tests.log. Can you fix the errors?