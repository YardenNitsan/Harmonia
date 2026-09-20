# Dataset and artifact audit

Audit date: 2026-09-20. This document was created before Harmonia dataset acquisition or training. Research below used publisher pages and metadata only; no audio or annotation archive was downloaded by the research task. Intended use includes a potentially commercial desktop product, so noncommercial data is excluded from the default training/evaluation pipeline. This is an engineering rights inventory, not a claim that all jurisdictional questions are settled.

Unknown means not established from the inspected sources. Unknown counts must be measured after an approved acquisition; they are not zero. A publication's license does not establish its dataset's license. Annotation availability does not establish recording rights. “Approved” below means the publisher's explicit license supports the planned use, with its stated conditions.

## Acquisition decision

| Dataset                  | Default product training/evaluation                 | Main reason                                                                           |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GuitarSet 1.1.0          | Approved with attribution                           | Real audio and annotations published CC BY 4.0                                        |
| RWC original             | Excluded                                            | Legacy research distribution conditions; no unrestricted commercial grant established |
| RWC 2.0                  | Excluded                                            | Audio and curated annotations CC BY-NC 4.0                                            |
| McGill Billboard 2.0     | Annotations/features only; audio blocked            | CC0 annotation/feature release does not include recording rights                      |
| Isophonics               | Audio blocked                                       | Commercial recordings not distributed with annotations                                |
| ChoCo 1.0.0              | Eligible annotation partitions only; no audio grant | Mixed CC BY / CC BY-NC-SA and heterogeneous source rights                             |
| IDMT-SMT-Chords          | Excluded                                            | Evaluation purpose, CC BY-NC-ND 4.0; synthetic                                        |
| IDMT-SMT-Chord-Sequences | Excluded                                            | Evaluation purpose, CC BY-NC-ND 4.0; synthetic                                        |
| IDMT-SMT-Guitar          | Excluded                                            | CC BY-NC-ND 4.0                                                                       |

## GuitarSet: immediate real-audio experiment corpus

Source/version: [publisher release, 1.1.0](https://zenodo.org/records/3371780), [metadata API](https://zenodo.org/api/records/3371780), [collection design](https://guitarset.weebly.com/). The API returned `metadata.license.id = cc-by-4.0` on the audit date. The accompanying software repository's MIT license is a separate fact.

License: CC BY 4.0 for the release; commercial use and redistribution are permitted with attribution, license notice and indication of changes. Preserve author names, release DOI, license URL, and a transformation log. [License conditions](https://creativecommons.org/licenses/by/4.0/).

Audio and annotation availability: public downloadable archives. Start with microphone audio and JAMS; do not fetch multichannel variants unnecessarily.

| Artifact                   | Direct publisher download                                                                    | Publisher size | Publisher MD5                    |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------------- | -------------------------------- |
| JAMS                       | [annotation.zip](https://zenodo.org/records/3371780/files/annotation.zip?download=1)         | 39.1 MB        | b39b78e63d3446f2e54ddb7a54df9b10 |
| Real microphone recordings | [audio_mono-mic.zip](https://zenodo.org/records/3371780/files/audio_mono-mic.zip?download=1) | 656.9 MB       | 275966d6610ac34999b58426beb119c3 |

Population: 360 roughly 30-second excerpts, approximately 3 hours (derived estimate, measure exact decoded duration). Six performers play 30 lead sheets in comping and soloing versions. Five styles: rock, singer-songwriter, bossa nova, jazz and funk. Three progression families, two tempos. These are real recorded acoustic-guitar performances, with microphone and hexaphonic pickup alternatives, not synthesized music.

Vocabulary: instructed and performed chord annotations; exact segment count, quality histogram, extension coverage and inversion count are unknown until manifest preparation. Advanced structures can occur in performed labels, but their adequacy for every requested alteration must be measured. Per-string notes can support bass research; lowest sounding guitar note is not automatically a full ensemble's harmonic bass.

Annotation quality: performed chords are inferred from notes using instructed segmentation and roots. They are not independent manual chord-boundary judgments. Publisher lists timing errors in two annotations and one duplicated MIDI note; retain version and correction provenance. [Known issues](https://github.com/marl/GuitarSet).

Limitations: small repertoire, single instrument family, related takes, inferred labels and constrained styles. This is useful real-audio evaluation, not evidence of production accuracy across commercial mixes or rare jazz harmony.

Split policy: group microphone/pickup variants, comp/solo takes, and all performances of the same lead sheet. Prefer progression-family-disjoint splits for the primary experiment; only three families makes estimates high variance. Add performer-disjoint analysis and explicitly identify any shared compositions. Never randomly split frames or clips. Lock the test manifest before fitting; fit normalization/calibration on training/validation only. Acquisition should record downloaded hashes, extracted-file hashes, exact durations, segment statistics and exclusions in a machine-readable manifest.

## RWC original

Source/version: [AIST original RWC database](https://staff.aist.go.jp/m.goto/RWC-MDB/), releases dating to 2001–2003, rather than the new online rerelease. License: legacy distribution/research terms; unrestricted commercial training or redistribution was not established in this audit. Do not infer it from “copyright-cleared” or the subset name “Royalty-Free.”

Audio: historically distributed by the project; annotations maintained separately. Population: popular 100, royalty-free 15, classical 50, jazz 50, genre 100 pieces; instrument samples are a different collection. Hours and chord segments: unknown here. Vocabulary/advanced chords/inversions: annotation-source dependent, not all 315 pieces have chord ground truth. Genres: pop, classical, jazz and other styles. Recording type: commissioned/performed music, with arrangements that may include sequenced instruments; not a purely synthetic chord benchmark. Annotation quality and limitations: heterogeneous legacy annotations and alignments. Intended training safety: not approved; the rerelease provides a clearer current route for noncommercial research only.

## RWC 2.0

Source/version: [2026 audio release v1](https://zenodo.org/records/17177919) and [curated annotation repository](https://github.com/rwc-music/rwc-annotations). The v1 page advertises a newer version; pin and inspect that version before any later acquisition rather than silently treating v1 as latest.

License: audio CC BY-NC 4.0; curated annotation repository also CC BY-NC 4.0. Commercial use is excluded by the default license; redistribution must retain noncommercial conditions and attribution. Not approved for this commercial-capable product's default data path without additional rights.

Audio: public WAV archive, v1 about 13.4 GB. Annotations: available separately, with curated chords for RWC-P and beat/MIDI resources across subsets. Population: 315 recordings across five music subsets, of which 100 popular tracks are the immediate chord subset. Hours and chord-segment counts: unknown in this audit. Vocabulary: inspect the pinned RWC-P chord annotation README and files before mapping; advanced/inversion counts unknown. Genres/type/real-vs-synthetic: diverse recorded music, with some sequenced instrumentation. Quality: curated filenames, formats and automated integrity checks improve usability; timing or interpretation can still vary. Limitations: unequal annotation coverage, legacy arrangements, license restriction, version drift.

## McGill Billboard

Source/version: [DDMAL McGill Billboard Project, 2.0](https://ddmal.ca/research/The_McGill_Billboard_Project_%28Chord_Analysis_Dataset%29/). License: CC0 for published annotations and features. Commercial use and redistribution of those released materials are permitted; the source recordings are not licensed by that grant.

Audio availability: recordings not supplied as a freely reusable corpus. Annotation availability: downloadable chord/structural data plus audio features. Population: 890 chart slots covering 740 distinct songs; count unique songs for splitting. Approximate hours and segment counts: unknown here. Vocabulary: rich chord annotations; advanced and inversion coverage needs counting. Genres: chart-derived popular music. Recording type: commercial full mixes, real performances/produced tracks, not a synthetic benchmark. Quality: human analytical annotations, with revisions between releases. Limitations: duplicates, edition/alignment matching, class imbalance, absent audio rights. Safe intended use: CC0 annotations/features can support authorized experiments, but waveform-based training/evaluation remains blocked until recording rights and lawful acquisition are documented.

## Isophonics

Source/version: [C4DM reference annotations](https://isophonics.net/content/reference-annotations.html), legacy collection with no single pinned release established; [ChoCo](https://github.com/smashub/choco) lists a 300-item Isophonics partition. License: this audit did not establish an unambiguous global license for all original downloadable annotation files. ChoCo's converted partition has its own stated terms; it does not license the commercial audio.

Commercial/redistribution restrictions: raw audio rights unresolved; do not redistribute recordings. Audio availability: source CD editions documented, not supplied as reusable WAV data. Annotation availability: LAB/TXT and RDF for chords, keys, structure and beats. Songs: approximately 300 in the ChoCo snapshot, original chosen subset must be enumerated. Hours/segments: unknown. Vocabulary: Harte, supports advanced chords and bass intervals; exact coverage unknown. Genres: pop/rock. Recording type: commercial recordings, real audio. Quality: Beatles annotations repeatedly checked; other subsets receive more qualified confidence from their curators. Limitations: ambiguity, typos, edition offsets and artist concentration. Safe intended training: audio blocked pending rights; do not use stream acquisition as a workaround.

## ChoCo

Source/version: [Zenodo 1.0.0](https://zenodo.org/records/7706751), [repository/license](https://github.com/smashub/choco), [authors' data paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511441/). License: generally CC BY 4.0; Chordify Annotator Subjectivity, Mozart Piano Sonata and Jazz Audio-Aligned Harmony partitions are CC BY-NC-SA 4.0. Commercial use is possible only for eligible partitions; redistribution must follow each partition's attribution/share-alike/noncommercial conditions.

Audio: annotation collection, not 20,000 downloadable licensed recordings. Annotation availability: JAMS and knowledge graph, audio seconds or score metrical positions. Count: paper reports 20,086 JAMS (2,283 audio-associated and 17,803 symbolic); repository headline says 20,080. Pin artifact and count rather than reconcile by assumption. Hours: unknown for a deduplicated audio subset. Chord observations: paper reports 1,575,409 across the whole mixed corpus, not an audio-only count. Vocabulary: Harte plus Roman source annotations, broad extensions/inversions; exact per-partition distribution unknown. Genres: heterogeneous, including jazz/classical/pop/rock. Recording type: mixed score annotations and annotations of real recordings; scores are not audio. Quality: curated human/crowdsourced labels transformed between representations. Limitations: conversion loss, overlapping source corpora, mixed terms and missing recording permissions. Safe intended use: approved eligible annotation-only partitions with provenance; no blanket acoustic-training approval.

## IDMT-SMT-Chords

Source/version: [Fraunhofer publisher](https://www.idmt.fraunhofer.de/en/publications/datasets/chords.html), [release record](https://zenodo.org/records/7544213); exact release version unknown here. License: publisher specifies evaluation purpose and CC BY-NC-ND 4.0. Commercial use excluded; no redistribution of adaptations under that license. Not approved for product training.

Audio/annotations: downloadable synthesized WAVs and MIDI-based chord material. Population: 16 files, 4.1 hours, 7,398 two-second chord segments. Vocabulary: major/minor/power/maj7/min7/dom7/half-diminished, 576 nonguitar classes and 273 guitar voicing classes as described by publisher. Advanced: sevenths, but not evidence for ninth/eleventh/thirteenth coverage. Inversions: explicit, including all listed nonguitar inversions. Genres: none in a song-corpus sense. Recording type: software-instrument renders, entirely synthetic. Annotation quality: exact generating symbols and timing, but sonic realism is constrained. Limitations: fixed tempo/duration, limited instruments and qualities, synthetic domain gap, license. Cannot serve as final real-music evaluation.

## IDMT-SMT-Chord-Sequences

Source/version: [Fraunhofer publisher](https://www.idmt.fraunhofer.de/en/publications/datasets/chord-sequences.html), [release](https://zenodo.org/records/7544225), 2021 corpus; archive version unknown here. License: publisher says evaluation purpose, CC BY-NC-ND 4.0. The accompanying paper's CC BY 4.0 does not override this. Commercial use excluded; adaptation redistribution restricted. Not approved for product training.

Audio/annotations: public synthesized sequences plus JSON/CSV metadata. Population: 15,000 sequences in 5,000 similarity triplets, each 4–32 seconds, 45 instruments. Total hours and chord segments: unknown. Vocabulary/advanced/inversions: unknown without inspecting generation metadata. Genres: constructed progressions, not representative recorded songs. Recording type: MIDI/FluidSynth renders, synthetic. Quality: generation-based labels and similarity relations. Limitations: instrument/render correlation, triplet leakage and unknown advanced coverage. Not a final real-audio benchmark.

## IDMT-SMT-Guitar

Source/version: [Fraunhofer guitar dataset](https://www.idmt.fraunhofer.de/en/publications/datasets/guitar.html), [release](https://zenodo.org/records/7544110); version unknown here. License: CC BY-NC-ND 4.0, evaluation purpose. Commercial use excluded; adapted redistribution restricted. Audio/annotations: downloadable guitar recordings and transcription metadata. Songs/hours/chord segments: unknown in this audit. Vocabulary/advanced chords/inversions: not established as a complete timed chord vocabulary. Genres: guitar exercises/pieces; exact distribution unknown. Type: real guitar recording corpus; subset contents require inspection. Quality: transcription-oriented annotations; not verified as independent chord labels. Limitations: narrow instrumentation and restrictive license. Not approved for default product training/evaluation.

## Model artifacts are separately audited

| Artifact    | Code/weights evidence                                                                                                                                                                                                                                              | Decision before integration                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BTC-ISMIR19 | [Original repository](https://github.com/jayg996/BTC-ISMIR19) identifies MIT code; explicitly says source audio was not distributed                                                                                                                                | Research baseline candidate. Pin code and separately establish checkpoint provenance/license before bundling; do not replicate its historic streaming acquisition                |
| LV-Chordia  | [Packaging project](https://github.com/openmirlab/lv-chordia) declares MIT and bundles five original-model checkpoints; [original repository](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition) also includes weights and MIT licensing | Approved for pinned local-file baseline acquisition/inference with MIT notices; retain hashes and source lineage. This does not grant rights to the original training recordings |
| ChordFormer | [Authors' paper](https://arxiv.org/abs/2502.11840) establishes architecture; redistributable official checkpoint not established here                                                                                                                              | Architecture evidence; no claim that a licensed runnable model is integrated                                                                                                     |
| Beat This!  | [Authors' repository](https://github.com/CPJKU/beat_this) explicitly licenses code and weights MIT, with a training-rights caveat                                                                                                                                  | Candidate beat/downbeat baseline; record its training overlap and benchmark locally                                                                                              |

The raw MIT licenses in the [original repository](https://raw.githubusercontent.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition/master/LICENSE) and [LV-Chordia](https://raw.githubusercontent.com/openmirlab/lv-chordia/master/LICENSE) were read on the audit date; both attribute Music X Lab (2023). No separate checkpoint restriction was identified in these inspected repositories. This is the evidence for the acquisition/inference decision, not a warranty of training-corpus rights.

No dataset download, model execution, accuracy score, or trained checkpoint is established by this research document. Actual acquisitions and runs belong in the experiment registry and final report.
