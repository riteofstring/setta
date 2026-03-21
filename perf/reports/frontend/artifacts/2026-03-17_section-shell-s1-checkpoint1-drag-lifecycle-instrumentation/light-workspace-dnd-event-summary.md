# Light Workspace DnD Event Summary

## Clean Branch

- Representative: `light workspace and standalone callable routes preserve reorder and tab indent behavior`
- Result: passed
- Key DnD sequence:
  - `start` active height: `21`
  - `placeholder:reorder nextIndex`: `2 -> 1 -> 0`
  - `end:move newIndex`: `7`
  - `move:response`: `200`

## Failing Wrapper-Geometry Variant

- Representative: `light workspace and standalone callable routes preserve reorder and tab indent behavior`
- Result: failed with visible order `h > k > i > j`
- Key DnD sequence:
  - `start` active height: `20`
  - `placeholder:reorder nextIndex`: `2 -> 1`
  - final hover on the top row never reaches the clean branch's last `pastHalfway: false` transition
  - `end:move newIndex`: `8`
  - `move:response`: `200`

## Read

- The failure is not a dead-collision problem:
  - the failing run still resolves `over` collisions for the top row
- The failure is not a missing backend-sync problem:
  - the failing run still reaches `end:move`, `move:send`, and `move:response 200`
- The divergence is the last insertion step:
  - the clean run reaches the final top-row reorder step and commits `newIndex: 7`
  - the failing geometry variant stops one step earlier and commits `newIndex: 8`
- Working conclusion:
  - the changed row geometry is perturbing the final halfway / insertion math in the shared row contract
