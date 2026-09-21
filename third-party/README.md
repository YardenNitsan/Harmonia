# Retained notices

Guitar practice grips include derived data from David Rubert's `tombatossals/chords-db`
under MIT. The pinned source, full copyright/license and validated derivative are
in `packages/domain/data`; build preparation copies the notice to bundled
`runtime/chords-db-LICENSE.txt`. See `docs/practical-voicing-sources.md` for provenance,
validation/rejection rules and limits. Harmonia does not redistribute educator
diagrams; its piano diagrams are rendered from its own voicing algorithm.

`ONNX-Runtime-LICENSE.txt` is the upstream MIT license for the pinned ONNX Runtime
v1.30.0, sourced from the Microsoft repository's release tag. Runtime preparation
copies it beside the shipped WASM files.

The experimental model's GuitarSet attribution is retained in
`ml/artifacts/structured-chord-v1/ATTRIBUTION.txt` and copied into bundled model assets.
LV-Chordia's MIT notice is retained in `ml/third-party/`; that research package is not
currently bundled in the desktop application.

Full transitive native/frontend/scientific license inventory remains a public-release
gate. These notices do not grant a public license to the Harmonia application itself.
