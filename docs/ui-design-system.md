# Listening-room design system

Implemented tokens: `apps/desktop/src/styles/tokens.css`; layout and responsive states:
`styles/app.css`. Dark ink surfaces, warm ivory text, sage/mint musical highlights,
amber warning and coral error semantics. Segoe UI/system typography keeps rendering
offline; Georgia is used only for the introductory musical motif. Spacing follows
an 8px foundation, fine 1px separators and 6/10px radii. Raised controls use restrained
surface changes rather than repeated cards or decorative gradients.

The current chord dominates a three-position harmonic stage. Adjacent chords are
quieter. The waveform, proportional chord blocks, beat ticks and playhead share the
same time axis. A right-side harmony inspector moves below the stage in compact
windows. Optional piano and guitar maps expose the structured pitch content.

Motion is 140/260ms, limited to transform/opacity and interaction feedback. The audio
clock drives position at up to 30 display updates/second within the playback subtree.
Reduced-motion preference disables decorative transitions and beat pulsing.

All controls have semantic buttons/labels and visible keyboard focus. Space toggles
playback and arrows seek when focus is outside a control; native control keys remain
available. The chord editor uses a modal dialog with native focus containment.
There is no external font, artwork or analytics request. Demo notation is explicitly
authored reference data; imported-song output identifies its actual analysis method.
