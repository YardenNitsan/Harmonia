# ADR 004: Worker-owned derived-feature filesystem cache

Status: implemented and production-browser/hidden-native verified, 2026-09-20.
The visible desktop remains closed pending all product acceptance gates.

Use a dedicated origin-private filesystem directory, `harmonia-features-v1`, from
the import worker. A named exclusive Web Lock serializes all index/file operations
across workers. If OPFS or Web Locks are unavailable, skip caching and extract
normally. No SQLite changes, IndexedDB substitute, raw audio or PCM persistence.

The [File System standard](https://fs.spec.whatwg.org/) defines writable streams
whose modifications become visible when closed. The
[Web Locks standard](https://www.w3.org/TR/web-locks/) defines origin-scoped locks
and their release on worker termination. Use asynchronous `createWritable`, not
in-place synchronous access handles: close publishes a completed individual file.
This is not a multi-file transaction or a guarantee of power-loss durability.

Each payload uses an immutable UUID filename. Write and close it first, then
write and close the bounded `index.json` manifest referencing it. Before publication
evict expired/LRU entries, deleting their payloads first; interruption can leave
missing references (safe misses) or unreferenced payloads (safe cleanup). On the
next operation, validate the index and scan the dedicated directory, deleting
unreferenced files. An invalid index causes cache reset, never analysis failure.
All operations occur under the lock, so active writes cannot be mistaken for
orphans. A terminated worker releases the lock and never publishes analysis state.

Limits: 16 MiB per payload, 128 MiB retained payloads, 32 records, 30-day idle TTL,
64 KiB index. Cleanup processes at most 128 directory entries per operation; if
more remain, skip caching until subsequent cleanup makes progress. No recursive
deletion outside the owned directory. Allow one in-flight payload and temporary
index/write-stream implementation overhead beyond retained limits; browser-owned
temporary storage and filesystem overhead cannot be hard-bounded by this code.
Metadata is bounded before JSON parsing and payload size before buffer reading.

Key fields: audio SHA256, browser decode/mix contract version, decoded sample rate,
sample count, channel count, feature version and binary codec version. DSP features
are shared across profiles; model features use their distinct extraction contract.
Model/profile changes retain valid reusable features. Completed-analysis identities
and recognition/extraction behavior remain unchanged.

DSP packing preserves Float64 frame time/chroma/bass/RMS/onset and waveform values;
model features preserve their Float32 values and Float64 times. Validate shape,
timing, finite/range constraints, key identity, byte bounds and SHA256 before reuse.
Corruption, denial, quota errors and lock contention produce ordinary cache misses.
Take locks with `ifAvailable` so another window's work cannot indefinitely queue
analysis. Extraction remains outside the storage lock. Storage writes must finish
before sending the final result, because the host then terminates the worker.
Initialization and each complete lock request have a two-second optional-operation
deadline. The deadline races outside the lock lifetime: timeout disables that cache
instance and permits extraction, while pending I/O retains its lock until it really
settles or the worker terminates. Never release a lock while its writes continue.
Ordinary completion awaits publication; a timeout may leave a valid late write or
an orphan, both handled by the same recovery rules. Retained-file size checks use
filesystem metadata; unrelated cache reads do not load every tensor.

Tests cover codec parity and malformed data, identity invalidation, repeat/profile
reuse, checksums, TTL/LRU/size caps, failed publication/orphans and bounded cleanup,
storage denial and cancellation. Real production-worker tests exercise OPFS and
locks under CSP. Native WebView filesystem reuse requires its own hidden smoke.

Production-browser evidence: `tests/e2e/feature-cache.spec.ts` verifies DSP reuse
from fast to accurate, both feature families reused after reload with exactly
equal E004 analysis values (apart from creation time), corruption recovery and
an actual worker termination releasing its origin lock before orphan cleanup.
This is filesystem feature reuse; decoding and model inference still run when a
completed analysis is absent. Existing completed-analysis hits bypass this work.

Hidden-native smoke passed on the rebuilt release executable. Inspection read
the same directory/index after fast then accurate analysis: the original DSP
key/file/checksum remained and one model record was added. Both files survived
process restart; a new fast import reused the original DSP file and updated its
access time. Evidence: `docs/review-evidence/native-smoke-continuation.json`.
The worker reports `Reusing local analysis features` through ordinary progress;
there is no product debug endpoint or window-global cache handle.
