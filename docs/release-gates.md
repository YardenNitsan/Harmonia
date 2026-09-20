# Remaining acceptance gates

This audit follows the master specification in `../instructions.txt` (relative
to the repository root). A passing checkpoint is not final product approval.
The visible desktop must stay closed until the operating guide's gates pass.

The read-only `review-evidence/release-environment.json` inventory identifies
Windows 11 Home on a Core Ultra 7 development PC with about32GiB RAM. No supported
VM/Sandbox command was found in the current command environment; no code-signing
certificate was found in CurrentUser/My or LocalMachine/My. This is not proof that
every possible external VM or signing service is unavailable. Host configuration
was not changed.

## Required local implementation and research

| Work                                   | Evidence and next acceptance condition                                                                                                                                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual correction                      | Atomic chord/start/end correction is implemented. Unit/browser and hidden native tests verify neighbor/history consistency, save-failure recovery, reopening/export and live loop timing. Preserve these regressions.                                                                                          |
| Boundary refinement                    | Master sections 4–6 require independent boundary candidates with later split/merge refinement. `packages/audio/pipeline.ts` currently computes novelty scores but forms segments from stabilized label changes. Implement and evaluate the candidate/refinement pipeline separately from frozen model reports. |
| Feature reuse and cleanup              | Worker-owned OPFS feature caching is implemented with versioned identities, checksums, limits and recovery (ADR 004). Production-browser reuse/corruption/worker-termination tests and hidden-native cross-profile/process-restart reuse pass.                                                                 |
| Model quality and production inference | HU33 E007–E009 and LV export research do not satisfy final accuracy. Resolve representation/data coverage, retained numerical failures, full preprocessing/runtime parity and measured model selection; keep the test closed until a new freeze.                                                               |
| Provider implementation                | Local files work. Official remote adapters, capability-aware UI, secure credential handling where needed, and expiry/outage tests remain implementation work. Public YouTube embedding is not inherently blocked by a Data API credential. See `provider-capabilities.md`.                                     |
| Failure/performance campaign           | Extend local offline, cancellation, corruption, memory/stress, startup and forced-CPU evidence. Existing CPU throttling and hidden smoke cover bounded flows, not the whole master acceptance campaign.                                                                                                        |

Capo helpers, chord search, modulation display and other section 50 suggestions
are potential features. Section 45 presents dragging/context-menu/region gestures
as potential interactions; accessible numeric correction can satisfy section 51
without claiming those gestures exist.

## Gates needing a suitable external environment or identity

| Gate                                    | Actual dependency                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean installation, upgrade and removal | A clean Windows environment without development tools; a suitable clean VM may suffice. Rebuilding NSIS and launching an isolated hidden WebView do not establish installation success. |
| Representative weak-PC performance      | Representative hardware/resource evidence. Developer-PC CPU throttling is useful but not equivalent to validating such a machine. Forced-CPU execution is locally testable.             |
| Other operating systems                 | Appropriate target OS/toolchain/runtime environment. Current Windows results do not establish other-platform success.                                                                   |
| Trusted release signing                 | An authorized signing identity under the project's release checklist. This is a project release rule, not an enumerated master-spec requirement.                                        |
| Authenticated provider validation       | Authorized registrations, eligible accounts and credentials where the official provider requires them. Adapter implementation and simulated failure tests can precede live validation.  |

Unavailable credentials or hardware must not be used to classify unfinished
local engineering or scientific work as externally blocked. Track actual evidence
in `implementation-plan.md`, `testing.md` and `final-report.md`.

Latest measured decisions: E010 passes its initial quality research gates and CPU
export parity, but still loses major recall; browser/runtime acceptance is separate.
D002's relative-bass direction fails its declared guards. B001 is implemented as
an independent strategy but rejected for losing short-transition recall; it is not
the production segmenter. LV's all-convolution and SELU arithmetic diagnostics
both retain logit failures. None of these results grants production promotion.
The YouTube adapter and strict message bridge are implemented foundations; final
embedding, capability-aware UI and installed-client identity remain open gates.
