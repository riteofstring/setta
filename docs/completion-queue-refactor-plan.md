# Completion Queue Refactor Plan

1. **Introduce read/write coordination around project refreshes**  
   - Wrap `BaseProjectManager.update()` and other mutation-heavy code paths in an async write lock.  
   - Provide a shared read lock that completion handlers acquire before touching `self.gen_code`, `self.code_dict`, or `ProjectPythonCode` instances so they can safely run in parallel when no refresh is underway.

2. **Let read-only routes bypass the global queue**  
   - Extend `enqueue_method` with an option (e.g. `require_serialization=True`) that keeps mutating operations in the FIFO queue while allowing read-only handlers to execute immediately.  
   - Mark the completion handlers (`text_field_completion`, `code_area_completion`, and `gen_code_*_completion`) as non-serialised once the locking primitives are in place.

3. **Eliminate shared temp-file contention**  
   - After the virtual-document work is validated, remove the temp-file writes from completion paths so queued updates no longer compete with them.  
   - Ensure diagnostic callbacks and cleanup logic work with the new approach.

4. **Regression coverage and validation**  
   - Add concurrency-focused tests or integration exercises that simulate a long-running `update()` alongside rapid completion requests, confirming state mutations continue to process in order.  
   - Run the existing backend regression commands plus targeted manual scenarios (e.g. trigger large regenerate, type in code editor) before and after the change.

5. **Finalize and document**  
   - Once the queue split is stable, remove any feature flags, document the new concurrency expectations for backend contributors, and update troubleshooting guides with the new locking model.
