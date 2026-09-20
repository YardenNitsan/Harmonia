# ADR 001: Separate local-first product and inward-facing contracts

Status: accepted, 2026-09-20.

Amendment: the user's Listen Live correction supersedes the file-first input
decision below. Repository separation and inward-facing contracts remain accepted.
See ADR006 and `docs/live-input-correction.md`; preserve this historical rationale.

Context: the workspace contains GuitarScaleViewer, a live-key guitar-practice app,
and a new specification for complete-song chord analysis, ML research, and packaging.
The existing repository has a user modification in `src-tauri/Cargo.toml`.

Options: restructure the old app; embed a second product inside it; create an adjacent
monorepo. Decision: create Harmonia adjacent to the existing repository. Reuse concepts
and available toolchains, not its unrelated runtime assumptions or mutable source.

Why: isolates the new domain and provider/privacy requirements and preserves user work.
Tradeoffs: separate frontend/native build setup and no automatic migration of old presets.

Use a framework-free domain, application contracts, replaceable infrastructure and
presentation. Start with local files, deterministic DSP and a clearly labeled demonstration;
do not claim trained-model accuracy before legal data and measurements support it.
