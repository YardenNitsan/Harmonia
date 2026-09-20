# Public real-recording follow-up audit, 2026-09-20

This bounded follow-up checked three candidates not individually audited in the
existing dataset/public-expansion records. It used publisher pages, a repository
README and file metadata. The initial audit downloaded no audio, annotation database
or corpus archive. A subsequently authorized five-file inspection is recorded below;
no training, inference or locked-test evaluation occurred. Existing GuitarSet/HU33
files, splits and experiments remain untouched.

**Decision:** no new full-mix corpus with established recording rights and aligned
chord labels was identified. One small isolated-guitar source has an explicit
publisher license, but is not ready for strict frame-level chord/bass supervision.
Do not turn this audit into an automatic corpus acquisition or model promotion.

## 1. Isolated Guitar Chords: limited supplementary candidate

Publisher: `severyn-k/isolated-guitar-chords`; pinned revision
`873968c2499d528e57e9909001d4329917f3d677`.
The [embedded repository README](https://huggingface.co/datasets/severyn-k/isolated-guitar-chords/blob/873968c2499d528e57e9909001d4329917f3d677/README.md)
describes manually recorded acoustic guitar from one player/instrument, repeated
fingerings and strums, approximately 5.5-second clips and leading silence. Its
license section expressly applies CC BY 4.0 to the dataset and allows commercial
use, modification and redistribution with attribution. This is more evidence
than a hosting-site license tag alone. The citation still contains placeholder
author/URL fields; preserve the publishing account and pinned source rather than
inventing a person's identity. Under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
retain attribution/license notices and identify transformations.

Observed [file-tree metadata](https://huggingface.co/api/datasets/severyn-k/isolated-guitar-chords/tree/873968c2499d528e57e9909001d4329917f3d677?recursive=true&limit=1000):

- 780 WAV files, **451,579,522 bytes** of advertised audio payload; 782 files total.
- Published directories contain 633 Train and 147 Test WAVs. This was filename
  inventory only, not audio inspection or evaluation of that source's Test split.
- Folder vocabulary is 12 major and 12 minor chords plus Noise. No timed label,
  bass/inversion or seventh/extension annotation files are listed.
- Non-audio files are `.gitattributes` and `README.md`; no separate license file
  appears. No claim is made about uninspected WAV-embedded notices.
- Raw pinned README SHA-256:
  `3a7627b45f9d3427d6536d0ec7eeda224847f4af4f3890a2e9d69b8e8f7d7a3a`.

Important discrepancy: a Train/Am path is
`AM_acoustic_guitar_garage_band_1.wav`, while many other paths name a Fender guitar.
A DAW-like filename does not prove synthesis, but manual-recording provenance for
that subset is not independently established. Exclude that subset from any claim
of verified real performance until resolved. The folder label does not establish
the sounding bass or onset/offset; leading silence and decay must not inherit a
chord label, and Noise is not automatically an explicit musical no-chord target.

The initial inspection-only proposal selected the following five Train files under
the publisher's stated license: **2,544,020 bytes total**. These were publisher
metadata estimates at proposal time; the later acquisition below verified every
size and LFS hash. Acquisition neither clears the broader provenance caveat nor
approves training.

| Path below `data/Train/`                       |  Bytes | Publisher LFS SHA-256, subsequently verified against audio         |
| ---------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `Cm/Cm_acoustic_guitar_fender_fa_series_1.wav` | 503876 | `fa14180b0f18aa0ccf3b21d52f9c115b2cf2a4bb721ed12b78ca42bf9d02325f` |
| `Dm/Dm_acoustic_guitar_fender_fa_series_1.wav` | 489796 | `97ec50c8ac57dc9eeb6e17e95bf2e209dfafbd3a8c931d5ba0c528dfe78ef03b` |
| `Em/Em_acoustic_guitar_fender_fa_series_1.wav` | 544356 | `7975386c3e2649f1c9b04f3b4441e42df3d7e959300e35e9e59b9b4b7bbd6679` |
| `Fm/Fm_acoustic_guitar_fender_fa_series_1.wav` | 503876 | `de7072b54ea201d58b7805913a1e2e6c27dcf89c4b4f0e2c4708c64c471c8320` |
| `Gm/Gm_acoustic_guitar_fender_fa_series_1.wav` | 502116 | `e5d605e48aa012cd78e469f567619d4c0d22c0676bb7e3f23d7c2111c9b938ae` |

Proposed split policy if later accepted: treat the entire one-player source as
one training-only performer/session group; do not relabel its published Test
directory as an independent artist test. Keep takes, fingering variants and
augmentations together; compare hashes and acoustic duplicates against existing
training/validation inventories before use. Unresolved duplicate groups stay out.
There are no identified song compositions to make a song-disjoint claim. New
aligned labels require a versioned review; choose any new validation/test corpus
independently and freeze it before tuning. Potential value is limited minor-triad
coverage, not inversion, rich harmony or full-mix acceptance.

### Authorized five-file inspection, 2026-09-20

The pilot acquired exactly the five pinned Train paths above. Before audio requests,
the pinned README matched its recorded SHA-256 and its explicit dataset CC BY 4.0
statement was checked again. The [CC BY 4.0 legal text](https://creativecommons.org/licenses/by/4.0/legalcode.txt)
was retained with source attribution. The machine-readable
[inspection report](isolated-guitar-pilot-873968c-report.json) records exact source
URLs, source/decoded hashes, bounds, response metadata, dimensions, signal statistics
and embedded metadata. Original WAVs, README, license, attribution and an identical
JSON manifest are retained under the ignored local directory
`ml/data/downloads/isolated-guitar-pilot-873968c/`.

The first attempt received and verified the 503,876-byte Cm file, then failed while
printing embedded metadata through a cp1252 console. It published no files. One
explicitly authorized retry used ASCII-safe logging and saved each verified file
atomically before logging. **Unique retained audio is 2,544,020 bytes; cumulative
audio received is 3,047,896 bytes**, within the revised 3,050,000-byte cap. Every
response was bounded to at most 600,000 audio bytes; HTTPS redirects, response sizes,
safe destination paths and publisher LFS SHA-256 were checked. The successful attempt
received 23,041 metadata bytes. Initial-attempt metadata was not separately counted;
its two bounded requests allowed at most 70,000 bytes. No further retry occurred.

All five files decode as **44,100 Hz, one channel, PCM16**, with finite samples,
peaks below full scale and no samples at absolute amplitude 1. RIFF lengths and
chunk bounds were checked. Total decoded duration is **27.816780 seconds**. Neither
source-byte hashes nor decoded-PCM hashes duplicate another file within this pilot;
no comparison against existing corpora was performed.

| Folder name (unverified label) | Frames | Duration (s) | Peak absolute amplitude | First active RMS window (s) |
| ------------------------------ | -----: | -----------: | ----------------------: | --------------------------: |
| Cm                             | 242880 |     5.507483 |                0.635681 |                        0.06 |
| Dm                             | 235840 |     5.347846 |                0.819855 |                        0.06 |
| Em                             | 263120 |     5.966440 |                0.885101 |                        0.06 |
| Fm                             | 242880 |     5.507483 |                0.961609 |                        0.07 |
| Gm                             | 242000 |     5.487528 |                0.970245 |                        0.06 |

Activity uses 10 ms RMS windows and a linear threshold of 0.001 (about -60 dBFS).
Every clip's final window remains above that threshold. Exact leading zeros cover
only 0.02687–0.02757 seconds; no clip has trailing exact-zero samples. These
observations do not support blindly assigning the README's approximately one-second
leading-silence description to these files. Low-level activity could include noise
or handling; this procedure establishes neither chord onset/offset nor musical
no-chord intervals. No perceptual listening or musical-label verification occurred.

Parsed ID3v2.4 text/comments identify `RecForge II` and `Recorded by RecForge II`;
LIST/INFO identifies `Lavf58.20.100`. These are software tags, not verified performer
or author identities. All files include the same 16,769-byte JPEG artwork; its
matching hash is an artwork duplicate, not an audio duplicate. Parsed artwork XMP
mentions GIMP/Exiv2 and an image-edit timestamp, which is not a recording date. No
conflicting restriction was found in the parsed text, comments or artwork XMP.
There is no separate WAV-embedded audio license grant: the explicit repository
statement remains the source grant. The raw metadata remains in the unchanged WAVs;
the artwork was neither decoded for viewing nor used as training input.

**Ruling remains inspection only.** The five files satisfy bounded acquisition,
source-integrity and basic decode checks. They do not establish aligned chord/bass
targets, minority qualities beyond the unverified minor-triad folders, recording
authorship independently of the publisher, or model quality. No published Test file,
existing corpus, training run, inference run or locked evaluation was accessed by
this inspection. Further use requires reviewed labels and provenance, duplicate
checks, and the performer/session grouping described above; full-corpus acquisition
and training are not approved by this pilot.

## 2. Weimar Jazz Database: annotation evidence, recording rights unresolved

The [publisher download page](https://jazzomat.hfm-weimar.de/download/download.html)
offers WJazzD v2.1 (DB version 2.2), 456 solo transcriptions, under ODbL. The
[schema](https://jazzomat.hfm-weimar.de/dbformat/dbformat.html) documents beat onsets
in seconds, accompanying chords and bass pitch, alongside composition, recording,
performer and track identities. This makes it a promising jazz-harmony reference,
but no grant for the underlying recordings was established from these sources.
[ODbL's content distinction](https://opendatacommons.org/licenses/odbl/1-0/)
does not supply missing rights over individual recordings. No database was fetched,
so its embedded `db_info.license` was not independently read.

Decision: no acoustic acquisition/training authorization. Public playback or a
recording identifier is not an audio license. Advanced/inversion class support and
payload size remain unmeasured. If recording rights are later established, group
every solo/cut from the same recording, alternate takes/remasters and the same
composition before splitting; additionally group shared performers for an
artist-disjoint assessment. Resolve overlap with converted jazz annotation corpora
before claiming new independent evaluation material.

## 3. Computer Music Analysis Dataset: not real-recording expansion

The [CMU publisher page](https://www.cs.cmu.edu/~music/data/melody-identification/)
describes MIDI files, melody-channel labels and 1,890 chord labels for 20 songs,
with a CC BY 4.0 statement. The linked paper is about standard MIDI files. This
does not establish a real-recording audio corpus or recording-rights grant.
Its reduced chord vocabulary even uses `N` for unknown, incompatible with treating
all such labels as known no-chord. No archive was fetched; internal notices and
size were not verified. Exclude from this acoustic expansion, irrespective of
possible future symbolic uses or separately licensed MIDI renders.

## Outcome

Broader lawful full-mix and inversion coverage remains unresolved. The isolated
guitar candidate is a small, conditional supplement with labeling/provenance work,
not a substitute for that missing corpus. Existing completed experiments should
not be repeated on the strength of this audit, and existing locked tests must not
become training or model-selection material.
