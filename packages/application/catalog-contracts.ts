export interface CatalogRecording {
  id: string;
  provider: 'commons' | 'youtube';
  title: string;
  artist: string;
  duration: number | null;
  thumbnail: string | null;
  pageUrl: string;
  audio: {
    url: string;
    license: string;
    licenseUrl: string;
    attribution: string;
    size: number;
  } | null;
}

export interface RecordingCatalogPort {
  search(
    query: string,
    provider: CatalogRecording['provider'],
    signal: AbortSignal,
    apiKey?: string,
  ): Promise<CatalogRecording[]>;
  acquire(
    recording: CatalogRecording,
    signal: AbortSignal,
    onProgress: (received: number, total: number | null) => void,
  ): Promise<File>;
}
