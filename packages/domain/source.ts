import type { SourceProvenance } from './types';

const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= max &&
  !Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
function url(v: unknown, hosts: string[]): URL {
  if (typeof v !== 'string' || v.length > 2048) throw new Error('Invalid source URL');
  const parsed = new URL(v);
  if (
    parsed.protocol !== 'https:' ||
    !hosts.includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    parsed.search
  )
    throw new Error('Unsupported source URL');
  return parsed;
}
/** Normalizes the persisted subset of catalog metadata; acquisition remains separately audited. */
export function validateSourceProvenance(value: unknown): SourceProvenance {
  if (
    !object(value) ||
    !['commons', 'youtube'].includes(String(value.provider)) ||
    !text(value.id, 256) ||
    !text(value.title, 1000) ||
    !text(value.artist, 1000) ||
    !object(value.audio)
  )
    throw new Error('Invalid source provenance');
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'provider',
          'id',
          'title',
          'artist',
          'thumbnail',
          'pageUrl',
          'audio',
          'duration',
        ].includes(key),
    ) ||
    Object.keys(value.audio).some(
      (key) => !['url', 'license', 'licenseUrl', 'attribution', 'size'].includes(key),
    )
  )
    throw new Error('Unexpected source metadata');
  if (value.provider === 'commons') {
    if (
      !/^[1-9][0-9]{0,19}$/.test(String(value.id)) ||
      !url(value.pageUrl, ['commons.wikimedia.org']).pathname.startsWith('/wiki/File:')
    )
      throw new Error('Invalid Commons source identity');
  } else {
    if (
      !/^[A-Za-z0-9_-]{11}$/.test(String(value.id)) ||
      value.pageUrl !== `https://www.youtube.com/watch?v=${value.id}`
    )
      throw new Error('Invalid YouTube source identity');
  }
  if (value.thumbnail !== null) url(value.thumbnail, ['upload.wikimedia.org', 'i.ytimg.com']);
  const audio = value.audio;
  if (
    !/^\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\.(wav|mp3|flac|ogg|oga)$/i.test(
      url(audio.url, ['upload.wikimedia.org']).pathname,
    ) ||
    !text(audio.license, 100) ||
    !text(audio.attribution, 8000) ||
    !Number.isSafeInteger(audio.size) ||
    Number(audio.size) <= 0 ||
    Number(audio.size) > 100 * 1024 * 1024
  )
    throw new Error('Invalid licensed audio source');
  const licensePath = url(audio.licenseUrl, ['creativecommons.org']).pathname;
  if (
    !/^\/(?:publicdomain\/zero\/1\.0|licenses\/(?:by|by-sa)\/(?:1\.0|2\.0|2\.5|3\.0|4\.0))\/$/.test(
      licensePath,
    )
  )
    throw new Error('Unsupported source license');
  return {
    provider: value.provider as SourceProvenance['provider'],
    id: value.id as string,
    title: value.title as string,
    artist: value.artist as string,
    thumbnail: value.thumbnail as string | null,
    pageUrl: value.pageUrl as string,
    audio: {
      url: audio.url as string,
      license: audio.license as string,
      licenseUrl: audio.licenseUrl as string,
      attribution: audio.attribution as string,
      size: audio.size as number,
    },
  };
}
