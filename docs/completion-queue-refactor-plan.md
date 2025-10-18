# Completion Queue Refactor Plan

1. **Introduce read/write coordination around project refreshes** ✅  
   - Added an `AsyncReadWriteLock` wrapper around `BaseProjectManager.update()` so refreshes acquire the write side before mutating shared state.  
   - Completion handlers and other read-only paths now enter the shared read lock before touching `self.gen_code`, `self.code_dict`, or `ProjectPythonCode` instances; they still run on the queue for now but are ready for parallel reads once the bypass lands.

2. **Let read-only routes bypass the global queue** ✅  
   - Added a `require_serialization` flag to `enqueue_method`; read-only handlers capture `frontendOpId`s but execute immediately while holding the shared read lock.  
   - Completion endpoints (`text_field_completion`, `code_area_completion`, `gen_code_prefix_completion`, `gen_code_suffix_completion`, `clear_text_field_completion`) now bypass the FIFO queue under the new decorator flow.

3. **Eliminate shared temp-file contention** ✅  
   - Completion handlers now render snapshot code into per-request temporary documents, open and close them with the LSP, and avoid writing through the shared `DBE` temp files.  
   - `LanguageServerWriter` issues `didClose` notifications and the new `temporary_document` helper cleans up diagnostics metadata and filesystem debris.

4. **Regression coverage and validation**  
   - Added an isolated unit test exercising the serialized vs. non-serialized decorator paths and confirming concurrent execution/pending-op tracking.  
   - Still need broader integration/manual validation (e.g. overlap `update()` with editor typing) plus the standard backend regression sweep.

5. **Finalize and document**  
   - Once the queue split is stable, remove any feature flags, document the new concurrency expectations for backend contributors, and update troubleshooting guides with the new locking model.
