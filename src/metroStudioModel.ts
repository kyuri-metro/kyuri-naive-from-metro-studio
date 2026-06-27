export type MetroStudioStation = {
  id: string;
  nameZh: string;
  nameEn: string;
  lineIds: string[];
  transferLineIds: string[];
  isInterchange: boolean;
  underConstruction?: boolean;
  proposed?: boolean;
};

export type MetroStudioLine = {
  id: string;
  nameZh: string;
  nameEn: string;
  color: string;
  isLoop: boolean;
  edgeIds: string[];
};

export type MetroStudioEdge = {
  id: string;
  fromStationId: string;
  toStationId: string;
  sharedByLineIds: string[];
  lengthMeters?: number;
  isCurved?: boolean;
};

export type MetroStudioProject = {
  name?: string;
  stations: MetroStudioStation[];
  lines: MetroStudioLine[];
  edges: MetroStudioEdge[];
};

export type MetroStudioLineSummary = {
  id: string;
  label: string;
  stationCount: number;
  supported: boolean;
  unsupportedReason?: string;
};
