import { fft } from './fft';

export const FEATURE_VERSION = 'peak-chroma-v1';
export interface FeatureFrame {
  time: number;
  chroma: number[];
  bass: number[];
  rms: number;
  onset: number;
}
export interface AudioFeatures {
  frames: FeatureFrame[];
  waveform: number[];
  duration: number;
  hopSeconds: number;
}
export function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map((value) => value / norm) : values;
}
export function extractFeatures(
  samples: Float32Array,
  sampleRate: number,
  progress?: (value: number) => void,
): AudioFeatures {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new Error('Unsupported sample rate');
  if (samples.length === 0 || samples.length / sampleRate > 1200)
    throw new Error('Audio must be between one sample and 20 minutes');
  if (samples.some((sample) => !Number.isFinite(sample))) throw new Error('Invalid audio samples');
  const duration = samples.length / sampleRate;
  const size = 4096,
    hop = Math.max(1, Math.round(sampleRate * 0.02322));
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
  );
  const real = new Float64Array(size),
    imag = new Float64Array(size),
    magnitude = new Float64Array(size / 2);
  const frames: FeatureFrame[] = [];
  let lastEnergy = 0;
  for (let center = 0; center < samples.length; center += hop) {
    let power = 0;
    for (let i = 0; i < size; i++) {
      const position = center + i - size / 2;
      const sample = position >= 0 && position < samples.length ? samples[position] : 0;
      real[i] = sample * window[i];
      imag[i] = 0;
      power += sample * sample;
    }
    fft(real, imag);
    let max = 0;
    for (let i = 0; i < magnitude.length; i++) {
      magnitude[i] = Math.hypot(real[i], imag[i]);
      max = Math.max(max, magnitude[i]);
    }
    const chroma = Array<number>(12).fill(0),
      bass = Array<number>(12).fill(0);
    for (let i = 2; i < magnitude.length - 1; i++) {
      if (
        magnitude[i] < max * 0.015 ||
        magnitude[i] <= magnitude[i - 1] ||
        magnitude[i] < magnitude[i + 1]
      )
        continue;
      const left = Math.log(magnitude[i - 1] + 1e-12),
        mid = Math.log(magnitude[i] + 1e-12),
        right = Math.log(magnitude[i + 1] + 1e-12);
      const offset = Math.max(
        -0.5,
        Math.min(0.5, (0.5 * (left - right)) / (left - 2 * mid + right)),
      );
      const frequency = ((i + offset) * sampleRate) / size;
      if (frequency < 45 || frequency > 2500) continue;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      const pitch = ((midi % 12) + 12) % 12;
      const energy = Math.sqrt(magnitude[i] / Math.max(max, 1e-12));
      chroma[pitch] += energy;
      if (frequency < 260) bass[pitch] += energy * Math.pow(65 / frequency, 0.75);
    }
    const rms = Math.sqrt(power / size);
    frames.push({
      time: center / sampleRate,
      chroma: normalize(chroma),
      bass: normalize(bass),
      rms,
      onset: Math.max(0, rms - lastEnergy),
    });
    lastEnergy = rms;
    if (frames.length % 64 === 0) progress?.(center / samples.length);
  }
  const waveform = Array.from({ length: Math.min(900, samples.length) }, (_, bin) => {
    const begin = Math.floor((bin * samples.length) / Math.min(900, samples.length));
    const end = Math.floor(((bin + 1) * samples.length) / Math.min(900, samples.length));
    let peak = 0;
    for (let i = begin; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
    return Math.min(1, peak);
  });
  progress?.(1);
  return { frames, waveform, duration, hopSeconds: hop / sampleRate };
}
