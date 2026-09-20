import type { SavedTrack } from '../domain/types';

export interface AnalysisExport {
  filename: string;
  mediaType: 'application/json';
  contents: string;
}

export function createAnalysisExport(record: SavedTrack): AnalysisExport {
  return {
    filename: record.track.name.replace(/[^a-zA-Z0-9 ._-]/g, '_') + '.harmonia.json',
    mediaType: 'application/json',
    contents: JSON.stringify(record, null, 2),
  };
}
