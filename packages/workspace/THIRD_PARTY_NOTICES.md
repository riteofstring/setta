# Third-party notices

## Historical dnd-kit-derived interaction characterizations

The following package-owned Phase 0 interaction kernels closely port behavior and algorithm
structure from Setta's historical dnd-kit fork at source snapshot
`043d3b2e9c69caf99d1246f1408b3ad7194b7864`:

- `src/internal/collision-characterization.ts`, from
  `frontend/src/forks/dnd-kit/adapter/collision.ts` and
  `frontend/src/forks/dnd-kit/adapter/collisionCompare.ts`, with midpoint and retained-target
  behavior from `frontend/src/forks/dnd-kit/useDropType.ts`.
- `src/internal/sorting-preview.ts`, from
  `frontend/src/forks/dnd-kit/adapter/sorting.ts`.

Those historical sources carry the following notice:

> MIT License
>
> Copyright (c) 2021, Claudéric Demers<br>
> Modifications made by Kevin Musgrave & Jeff Musgrave
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The remaining fixture vectors and specifications are independently written behavioral evidence.
Exact-pinned runtime dependencies retain their own license material in their distributed packages.
