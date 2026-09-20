"""Owned, generated PCM playback for Windows loopback tests; no captured audio files."""

import argparse
import io
import json
import math
import os
import struct
import wave
import winsound

parser = argparse.ArgumentParser()
parser.add_argument("--frequencies", default="261.625565,329.627557,391.995436")
parser.add_argument("--seconds", type=int, default=25)
parser.add_argument("--sequence", action="store_true")
args = parser.parse_args()
if not 1 <= args.seconds <= 60:
    raise ValueError("Bound test duration")
frequencies = [float(value) for value in args.frequencies.split(",")]
if not 1 <= len(frequencies) <= 4 or any(not 50 <= v <= 2000 for v in frequencies):
    raise ValueError("Only bounded generated tones")
rate = 48000
payload = bytearray(rate * args.seconds * 2)
for frame in range(rate * args.seconds):
    # Fixed low-level generated test signal with a short click-free ramp.
    ramp = min(1.0, frame / 480, (rate * args.seconds - 1 - frame) / 480)
    elapsed = frame / rate
    tones = frequencies
    if args.sequence:
        tones = [130.812783, 164.813778, 195.997718] if elapsed < 16 else [] if elapsed < 20 else [195.997718, 246.941651, 293.664768]
    sample = sum(math.sin(2 * math.pi * frequency * frame / rate) for frequency in tones)
    struct.pack_into("<h", payload, frame * 2, round(sample * ramp * 0.04 * 32767))
buffer = io.BytesIO()
with wave.open(buffer, "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    wav.writeframes(payload)
print(json.dumps({"pid": os.getpid(), "generated": True, "seconds": args.seconds}), flush=True)
winsound.PlaySound(buffer.getvalue(), winsound.SND_MEMORY)
