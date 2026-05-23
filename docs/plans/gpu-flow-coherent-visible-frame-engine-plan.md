# GPU Flow Coherent Visible Frame Engine Plan

## Execution Plan

1. Create failing observed-behavior regression tests for the current breakage.

   Use Settings as the first stress benchmark because it currently exercises
   the broken path: large retained scenes, nested retained sections,
   browser-owned text controls, active editors, scroll, zoom, hover, resource
   debt, and browser visual readiness. Settings is not the architecture target,
   and this plan must not introduce Settings-specific rendering policy,
   Settings-specific scheduler behavior, or Settings-only fast paths.

   Add a new retained GPU Flow E2E spec using the Settings benchmark fixture,
   or extend the existing retained Settings specs, before changing runtime code.
   The tests must fail on the current branch and must use user-visible or
   browser-observable signals as the primary oracle:

   - continuous retained-section wheel scroll keeps RAF cadence within the
     existing retained-compositor budget, has no frame gap above 50 ms, and has
     no long task above 50 ms after screenshot capture windows are excluded;
   - a scroll burst produces intermediate visual movement samples instead of
     staying frozen until the wheel burst ends, with at least 4 intermediate
     displacement samples, no stationary run above `max(80 ms, p95Budget * 3)`,
     and no single visual jump above 85% of the total displacement;
   - every sampled frame keeps retained benchmark content visibly nonblank,
     keeps section header and row text ink present in the sampled section, and
     does not show high-confidence placeholder bands or whole-section
     disappearance;
   - text-like row value pixels, section headers, row labels, and scrollbars move
     together during retained-section scroll. Debug row metadata may be used to
     find stable regions to sample, but the pass/fail check must be based on
     screenshots, frame cadence, console/page errors, and interaction result;
   - browser visual withholding during motion preserves the last coherent
     visible frame or presents a complete compatible projection. It must not
     mutate only part of the visible frame, clear text actors, or advance the
     canvas while the browser visual plane remains stale;
   - console errors and page errors are failures. The current errors
     `GPU Flow blocked committed surface effect requires a rejected candidate effect.`
     and `GPU Flow held-previous committed surface effect requires a rejected candidate effect.`
     should be captured by the test's runtime-health collector, not special
     cased.

   Reuse the existing harnesses instead of adding a second measurement system:
   `settings-retained-frame-sampler.ts`,
   `settings-retained-compositor-scroll-continuity.spec.ts`,
   `settings-retained-user-recording-regressions.spec.ts`,
   `settings-retained-visible-frame-coherence.spec.ts`, and
   `gpuFlowPerformanceProbe.ts`. Derive the deterministic gesture from the
   latest Chrome recording:
   `./scripts/latest-chrome-recording.sh --json`, currently
   `recording-20260523-104209`.

   The failure report should attach the sampled screenshots, RAF interval
   summary, long tasks, top `gpu-flow-*` measures, console/page errors,
   visual-displacement series, and nonblank/ink statistics. Do not assert
   current implementation details such as publication lane names, internal
   effect kinds, or specific diagnostic counters as the primary pass/fail
   condition.

2. Baseline current head and choose the implementation base.

   Run only the new failing tests and the nearest existing retained GPU Flow
   visual/performance specs. Record the failing baseline in an append-only
   `perf/reports/frontend/<date>_gpu-flow-visible-frame-baseline.md` report.
   If the branch remains too broken for productive refactoring, create the
   implementation branch from the last usable retained benchmark commit and port
   the new failing tests first. This is a stabilization choice, not a
   compatibility strategy: the new runtime should replace the broken path,
   not support both.

3. Define the final module shape and deletion list before coding.

   The refactor should replace the visible-publication subsystem, not add a
   guard layer on top of it.

   New module shape:

   - `visibleFrameTypes.ts`: ids, outcomes, manifests, proof records, and
     actor contracts.
   - `visibleFrameEngine.ts`: `sample -> prepare -> prove -> present/abort`
     orchestration and starvation policy.
   - `visibleFrameActorAdapters/*`: retained pages, browser visuals, DOM
     islands, native visuals, HTML textures, hit/debug, and resource
     maintenance candidate preparers.
   - `visibleFramePresenter.ts`: the only production code allowed to expose
     visible DOM, canvas, committed store, hit/debug, and semantic snapshot
     changes.
   - `visibleFrameResourceRegistry.ts`: committed/candidate resource ownership,
     loser release, active-editor pins, and candidate abort release.
   - `visibleFrameDiagnostics.ts`: frame outcome, proof, debt, starvation, and
     timing reporting.

   Keep module responsibilities narrow:

   - `visibleFrameEngine.ts` orchestrates the frame lifecycle and owns
     starvation policy. It must not know retained page raster internals,
     browser host assignment internals, or HTML texture eviction details.
   - `visibleFrameActorAdapters/*` own actor-family proof details and candidate
     preparation. They must not mutate visible state.
   - `visibleFramePresenter.ts` performs only the final visible mutation batch.
     It must not decide actor-family readiness policy.
   - `visibleFrameResourceRegistry.ts` owns committed/candidate lifetime, pins,
     loser release, and abort release. It must not decide visual compatibility.
   - `visibleFrameDiagnostics.ts` records evidence. It must not become a hidden
     policy path.

   Modules and paths that must not survive as independent publication
   authorities:

   - `flowCommittedSurfacePublication.ts`
   - `flowSurfacePublicationCompletion.ts`
   - `visibleFramePublicationAuthority.ts`
   - `visibleFramePublicationOracle.ts`
   - `visibleFramePublicationCandidateOracle.ts`
   - old candidate/effect/oracle completion split paths
   - duplicate browser visual publication gates
   - any retained display, DOM-control, DOM-island, hit/debug, React semantic
     store, or canvas submission path that can mutate visible state outside
     `visibleFramePresenter.present()`.

   Deleting or reducing those paths is a merge requirement for this refactor,
   not a follow-up cleanup.

   Add a focused architecture/import test before the cutover is considered
   complete. After the new engine owns production presentation, no production
   import may reference:

   - `flowCommittedSurfacePublication.ts`
   - `flowSurfacePublicationCompletion.ts`
   - `visibleFramePublicationAuthority.ts`
   - `visibleFramePublicationOracle.ts`
   - `visibleFramePublicationCandidateOracle.ts`
   - old candidate/effect/oracle completion paths.

   Test-only imports may exist only for deletion assertions or migration
   regression tests with a comment naming the removal milestone.

4. Delete the partial single-authority cutover and define one visible-frame
   state machine.

   Replace the split between `flowCommittedSurfacePublication.ts`,
   `flowSurfacePublicationCompletion.ts`,
   `visibleFramePublicationAuthority.ts`,
   `visibleFramePublicationOracle.ts`,
   `visibleFramePublicationCandidateOracle.ts`, and lane-specific completion
   patches with a small explicit engine:

   - `VisibleFrameEngine.sample()` captures one immutable input sample:
     viewport, retained scroll offsets, active gesture owner, canvas size,
     DPR, scene generation, current committed frame id, and queued debt.
   - `VisibleFrameEngine.prepare()` asks actor adapters for candidate resources
     and proofs without mutating the visible frame.
   - `VisibleFrameEngine.prove()` decides whether the candidate is complete,
     compatible with the committed frame, blocked, or cold-start unavailable.
   - `VisibleFrameEngine.present()` atomically exposes canvas resources,
     browser visual plane transforms, hit/debug identity, runtime semantic
     snapshot, and debt accounting.
   - `VisibleFrameEngine.abort()` releases candidate-only resources and leaves
     the committed frame unchanged.

   Preserve the type-level split between content identity and presentation
   identity:

   - `ContentFrameId`: retained display, browser visual generations, DOM
     islands, native visuals, HTML textures, hit/debug generation, resource
     manifest, and React semantic snapshot that are valid together.
   - `PresentationId`: the visible projection of one `ContentFrameId` for one
     viewport/retained-scroll sample, plus the DOM transform batch, canvas
     command batch, hit/debug exposure, and debt snapshot presented together.

   Motion may create a new `PresentationId` for the same `ContentFrameId`.
   Content publication creates a new `ContentFrameId` and a new
   `PresentationId`. This distinction must be encoded in types so motion cannot
   accidentally masquerade as content publication.

   Every visible surface must expose or report the same current
   `PresentationId` after present:

   - canvas frame diagnostics;
   - DOM-control plane root;
   - DOM island layer root;
   - active editor handoff state;
   - hit/debug map snapshot;
   - runtime committed-frame store;
   - React semantic snapshot metadata;
   - retained scrollbar/native visual diagnostics.

   The same-epoch proof should be observable by E2E tests without relying on
   private lane names. The visual oracle remains screenshots and frame timing,
   but epoch mismatches make failures diagnosable and should fail targeted
   coherence tests.

5. Make proof reduction engine-owned and deterministic.

   `VisibleFrameEngine.prove()` is the only code allowed to reduce
   actor-family proofs into a frame outcome. Actor adapters may report proof
   facts, resource facts, required-vs-maintenance classification, and repair
   work, but they may not choose `presented`, `projected`, `held`,
   `blocked-cold-start`, or `aborted`.

   Required visible actors are part of the visual frame contract. Maintenance
   or refinement actors may keep debt queued without blocking a coherent
   presentation. Any actor that would create visible true-hole retained coverage,
   true-hole browser visual coverage, active-editor incoherence, hit/debug
   incoherence, or visible DOM/canvas epoch mismatch is required for that frame.

   Proof reduction order:

   1. If no committed frame exists and required first-visible coverage is
      missing, return `blocked-cold-start` or the deliberate shell state. Do not
      publish partial current-scene retained content.
   2. If any required visible actor reports `true-hole`, never present or
      project the candidate. Hold a compatible previous presentation if that
      previous presentation still covers every currently visible required actor;
      otherwise block cold-start or abort according to committed-frame
      availability.
   3. If all required visible actors are `exact` or strict
      `compatible-previous`, and `ContentFrameId` is unchanged, return
      `projected` with a new `PresentationId`.
   4. If all required visible actors are `exact` or strict
      `compatible-previous`, and `ContentFrameId` changed, return `presented`
      with a new `ContentFrameId` and `PresentationId`.
   5. If any required visible actor is `blocked`, hold the previous coherent
      presentation only when that previous presentation covers all currently
      visible required actors under the candidate projection. Preserve the
      blocking debt and count held age against starvation budgets.
   6. If candidate resources were prepared but the candidate cannot be
      presented, projected, held, or cold-started safely, abort candidate
      resources and leave the committed presentation unchanged.

   Strict `compatible-previous` must be compatible with the candidate
   `ContentFrameId` and `PresentationId`, not merely with any available cached
   pixels. The reducer must record which actor proof determined the outcome so
   Chrome recordings and E2E failure reports can explain why a frame presented,
   projected, held, blocked, or aborted.

   Add focused unit coverage for the reducer before integrating actor adapters:

   - true-hole proof wins over exact, compatible, and blocked proofs;
   - cold start cannot publish partial current-scene content;
   - projected advances `PresentationId` without advancing `ContentFrameId`;
   - presented advances both content and presentation identities;
   - blocked required actors preserve debt and can only hold when previous
     coverage proves complete;
   - maintenance/refinement debt remains queued without blocking a coherent
     presentation;
   - actor adapters cannot construct final frame outcomes directly.

6. Convert actor code into pure candidate preparers.

   Retained pages, browser visual actors, DOM islands, GPU-native visuals,
   HTML textures, hit/debug state, and resource maintenance should no longer
   publish themselves. Each actor family returns:

   - desired resource keys and visible regions;
   - exact, compatible-previous, blocked, or true-hole proof;
   - candidate resources that are safe to expose only if the whole visible frame
     presents;
   - repair or maintenance work that remains queued if the candidate aborts.

   Actors may allocate, rasterize, or upload candidate resources during
   preparation, but they may not update the committed visible frame, clear the
   DOM plane, swap active islands, clear hit maps, or publish React-visible
   semantic state.

   Add dev-only mutation guards around:

   - DOM-control store writes and visibility changes;
   - DOM island promotion/demotion;
   - committed-frame store mutation;
   - retained display publication;
   - hit/debug map swaps;
   - canvas command submission;
   - resource release that can remove currently presented resources.

   These guards should assert that visible mutation is running under the current
   `PresentationId` in `visibleFramePresenter.present()` or under
   `postPresent()` loser release for resources no longer referenced by the
   committed presentation.

7. Make `compatible-previous` a strict typed proof.

   `compatible-previous` must not be a loose adapter boolean. It should be a
   typed proof with family-specific required fields.

   Retained page compatibility must include:

   - retained content generation;
   - retained display or resource manifest id;
   - page coverage for the newly visible region;
   - clip-chain generation;
   - retained scroll/projection generation;
   - DPR and zoom-bucket compatibility;
   - visible true-hole count of zero.

   Browser visual compatibility must include:

   - actor id and semantic generation;
   - representation kind (`live-dom`, `snapshot`, or active editor);
   - browser visual generation;
   - source rect and visible clip;
   - clip-chain generation;
   - scroll/projection generation;
   - live host or snapshot resource identity;
   - active-editor state, when applicable.

   Active-editor compatibility is narrower than passive browser visual
   compatibility. It requires the same actor, the same live host unless a
   complete same-actor transfer is presented, preserved focus,
   selection/composition state, and a safe transform-only move or complete
   transfer proof.

8. Make browser visuals resource-like proof participants.

   Treat browser-rendered text/control pixels like retained pages for coverage
   proof, but do not flatten active live DOM into cache semantics:

   - passive live DOM hosts and snapshot sources are versioned resources with
     explicit actor id, visual generation, source rect, scroll/projection
     generation, and coverage proof;
   - "snapshot pending" and "live host budget" are blocked candidate states,
     not committed-frame effects;
   - compatible previous browser visual coverage can be reused only if the
     previous resource still covers the newly projected visible region and the
     actor's semantic generation allows reuse;
   - active editors are pinned live participants with focus, selection, IME
     composition, accessibility exposure, and pointer/event timing. They require
     pin, transfer, hold, and abort semantics instead of eviction/cache
     semantics;
   - a candidate that would detach, replace, hide, or move an active editor
     without a complete same-actor transfer must abort or hold the previous
     presentation;
   - passive text values stay browser-owned. Do not return to canvas-drawn
     text-like values or duplicated text layout logic.

9. Rebuild motion as a projection of the committed frame, not a publication
   shortcut.

   Motion frames may advance only by transforming the already committed visible
   frame plus compatible browser visual resources. They must not resolve
   retained runtime frames, publish content frames, upload passive browser
   snapshots, or partially mutate actor families.

   The motion path should have two outcomes:

   - present a complete projection of the current committed frame for the new
     viewport or retained-scroll sample;
   - hold the previous projection and keep motion debt queued when complete
     projection is impossible.

   Motion must not be allowed to indefinitely hide content/browser-visual debt.
   The scheduler remains a debt ledger and budget allocator, but the visible
   frame engine is the only presentation authority.

10. Put starvation and fairness budgets in the engine contract.

   Debt accounting must affect frame selection, not merely diagnostics. During
   continuous viewport or retained-section motion:

   - motion may present only if it proves compatible projection for all visible
     actor families;
   - every `N` ms or `M` motion presentations, the engine must run a bounded
     content/browser-visual probe unless the current gesture owner would make
     doing so unsafe;
   - held presentations do not clear motion, content, browser-visual, or
     maintenance debt;
   - held age counts against the same starvation budget as presented motion;
   - if visible browser-visual debt blocks projection beyond budget, the engine
     holds projection and prioritizes the blocking actor preparation over more
     motion presentations;
   - if retained page first-visible coverage debt blocks projection beyond
     budget, the engine prioritizes first-visible page preparation and upload
     over refinement or passive resolution upgrades;
   - maintenance/refinement debt can be deprioritized during active gestures,
     but visible true-hole or browser-visual debt cannot be starved behind an
     unlimited motion loop.

   The first implementation can tune `N`, `M`, and the budgets from the failing
   tests and Chrome recording baseline, but the policy must live in
   `visibleFrameEngine.ts`, not only in a report.

11. Add a real presentation barrier.

   The final present step should be an ordered batch that publishes all visible
   surfaces together:

   - canvas command submission and resource references;
   - DOM-control plane transforms and visibility;
   - DOM island transforms and visibility;
   - active editor handoff state;
   - hit/debug map identity;
   - runtime committed-frame store and React semantic snapshot;
   - debt cleared or retained for the next frame.

   A blocked or aborted candidate must not run any subset of this batch. The
   previous coherent frame stays visible until the next successful present.

   Split visible timing into three phases:

   - `prepare`: may stage DOM hosts offscreen, hidden, inert, or detached from
     the visible plane; may prepare GPU/canvas resources; may compute transform
     and visibility batches; may not expose visible DOM mutations.
   - `present`: applies the DOM visibility/transform batch, submits the canvas
     batch, advances hit/debug identity, updates visible stores, and records the
     `PresentationId`. It must be synchronous with respect to visible mutation:
     no `await`, no unbounded work, and no partial actor-family publish.
   - `postPresent`: releases losers, unpins candidate-only resources, schedules
     maintenance, and reports diagnostics. It may not release resources still
     referenced by the committed `PresentationId`.

   The ordering must be explicit and covered by screenshot-based coherence
   checks. Unit tests can verify guard behavior, but they are not enough.

   `present()` must run inside one rAF-controlled presentation window. It may
   only apply precomputed DOM batches and submit prebuilt canvas batches. It
   must stamp every visible surface with the same `PresentationId`/epoch. It
   must not trigger forced layout, measurement, async capture, or
   style-dependent branching.

   The next screenshot/sample after present must be able to prove that canvas,
   DOM-control plane, DOM islands, hit/debug state, retained native visuals, and
   scrollbars share the same presented epoch. This epoch proof is secondary to
   the visual oracle, but it should be a first-class E2E assertion for targeted
   coherence tests.

12. Simplify blocked, held, and cold-start semantics.

   The current errors show that "blocked" and "held previous" were modeled as
   if they always came from a rejected candidate effect. They do not. A blocked
   outcome can come from retained page coverage, browser visual readiness,
   actor resource proof, presentation proof, or cold start.

   Replace effect-specific blocked handlers with one outcome model:

   - `presented`: candidate became the committed visible frame;
   - `projected`: committed frame was projected for motion and all visible
     actors stayed coherent;
   - `held`: previous coherent frame remained visible and no candidate-visible
     mutation occurred;
   - `blocked-cold-start`: no committed frame exists, so a deliberate shell or
     blank-safe frame is shown until first complete coverage;
   - `aborted`: candidate resources were discarded and no visible state changed.

   These outcomes should drive debt and diagnostics directly. No outcome should
   require a fake rejected-candidate effect.

   Cold start must be a deliberate product state:

   - either block until the first complete content frame while the existing
     app-level loading UI remains responsible for the screen;
   - or present a deliberate shell that cannot be mistaken for partial retained
     content.

   Do not publish current-scene cold placeholders that look like real retained
   content with missing rows, missing headers, or blank text bands.

   The existing lower-level retained placeholder behavior is a migration trap.
   Any path that can publish an incompatible previous retained scene as a
   current-scene cold placeholder with empty retained draw regions must be
   deleted or restricted to the deliberate shell policy above. The visible
   engine must not allow lower layers to smuggle partial retained content into
   a frame labeled as coherent.

13. Borrow the right patterns from the example repos.

   Use the examples as lifecycle guidance, not as code to copy:

   - WICG/html-in-canvas: browser HTML snapshots are locked for the current
     rendering update; DOM changes made during paint affect later frames. GPU
     Flow should treat source DOM mutations as next-frame input, never as
     same-frame partial presentation.
   - `three-html-render`: an HTML texture has explicit `needsUpdate` and may
     fail capture while a snapshot is not ready. Failure keeps the previous
     texture; it does not publish a half-updated scene.
   - `three-html-render` interaction managers: browser interactivity is kept by
     applying one matrix transform per frame to real DOM, not by duplicating
     browser behavior in canvas.
   - `html-in-canvas-cracks`: the fixed stage and boot handoff avoid scroll
     drift and prevent an unready pipeline from bleeding through. GPU Flow
     should keep a fixed viewport presentation surface and reveal first content
     only after a complete first frame or deliberate shell.
   - `html-in-canvas-cracks`: texture reflow and viewport-locked geometry are
     separate. Retained GPU Flow surfaces should keep geometry/projection in
     CSS-pixel space and let resources prove coverage for that projection.
   - `compiz-web`: transitions keep old and new page textures alive together
     and remove the old page only when the transition completes. GPU Flow
     should keep committed and candidate resources live until present, then
     release losers after the barrier.

14. Remove transitional and duplicate paths.

   There is no backward compatibility requirement for this refactor. Delete the
   old publication authority path, old effect adapters, duplicate browser
   visual publication gates, compatibility aliases, and any fallback that makes
   a blocked candidate look successful. Keep one production path and update the
   architecture notes to describe it.

15. Verify in layers, then with the original repro.

   Required verification:

   - new observed-behavior tests from step 1 pass;
   - existing retained GPU Flow visual, scroll, interaction, active editor, and
     user-recording regression specs pass, including the Settings benchmark
     subset;
   - `pnpm -C frontend exec vitest run` on touched `frontend/src/gpuFlow`
     tests passes;
   - `./scripts/run-playwright-e2e.sh` for the retained benchmark subset passes;
   - `./scripts/quality/check.sh` passes before merge;
   - a new Chrome recording of the same manual scenario has no page/console
     errors, no long task above 50 ms during the observed scroll burst, no
     frame gap above 50 ms, no disappearing sections, and no stale browser
     visual/canvas split.

   Add active-editor stress coverage before declaring the engine complete:

   - IME composition survives retained-section scroll and projected viewport
     motion;
   - selection drag survives motion debt and candidate abort;
   - focus is preserved through held, projected, presented, and aborted
     outcomes;
   - pointer capture remains coherent during candidate abort;
   - an active editor whose row crosses a clip boundary either remains pinned,
     transfers atomically, or holds the prior presentation;
   - passive and active representations do not produce duplicate accessibility
     exposure for the same actor.

## Current Diagnosis

The latest Chrome recording is enough to explain the class of failure. The
visible-frame cutover introduced transaction vocabulary, but old publication
effects still leak through the final completion path. Blocked and held outcomes
are being completed by handlers that only accept `rejected-candidate`, while the
real blocked reasons include browser visual readiness, retained projection
coverage, cold start, and actor resource proof. That is why the recording logs
the two page errors about blocked/held committed surface effects requiring a
rejected candidate effect.

The performance stream also shows motion continuing while content and browser
visual debt remain unresolved. In the recording, hundreds of motion commits
occurred while content debt was still true, and blocked reasons were dominated
by browser visual snapshot/live-host readiness plus retained projection
coverage. The visible result matches the screenshots: canvas-retained content,
browser-rendered text controls, and section presentation are no longer exposed
as one frame.

The 100 ms-ish frame gaps and 100 ms-plus long tasks are not just tuning
problems. They are symptoms of a loop that keeps retrying expensive candidate
work while still letting parts of presentation move forward. A principled fix
needs a stricter presentation boundary, not more local guards.

## Architectural Constraints From Prior Iterations

Do not regress these decisions:

- Keep GPU Flow canvas-first. Do not return to a React Flow / XYFlow DOM graph
  as the visual authority.
- Keep retained parameter content descriptor-owned and page-rasterized. Do not
  return to whole-section DOM overlays.
- Keep passive text-like values browser-owned. Do not hand-roll text layout,
  caret, selection, IME, CodeMirror, or form-control rendering in canvas.
- Keep active editors as real browser DOM under the same actor identity as the
  passive value.
- Keep projection motion separate from content publication. The correction is
  stricter projection proof and presentation, not merging motion back into a
  full content publish path.
- Keep Chrome recording as evidence and diagnostics, not as rendering-policy
  input.
- Keep explicit resource budgets, but make them feed candidate proof and debt.
  Budgets must not silently publish partial visible frames.

## Success Criteria

The refactor is complete when retained GPU Flow surfaces behave like one
coherent visible surface under stress. The Settings benchmark must pass because
it is the current highest-pressure fixture, but no acceptance criterion may rely
on Settings-specific behavior:

- section headers, row chrome, browser-rendered values, active editors,
  scrollbars, hit maps, and debug identity advance together or hold together;
- motion presentations can advance `PresentationId` and `projectionSampleId`
  without changing `ContentFrameId`, while content publications advance both;
- continuous retained-section scroll has observable intermediate motion and
  stays within frame/long-task budgets;
- content and browser-visual debt cannot starve behind unbounded motion
  presentations;
- blocked browser visual resources preserve the committed frame instead of
  clearing or desynchronizing sections;
- active editors remain pinned or transfer atomically; candidates that would
  detach them without a complete transfer hold or abort;
- no visible frame contains true-hole retained coverage or true-hole browser
  visual coverage;
- diagnostics can explain every held or blocked frame without throwing page
  errors;
- all old publication-completion compatibility paths are gone.
