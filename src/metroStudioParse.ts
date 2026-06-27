import type { MetroStudioEdge, MetroStudioLine, MetroStudioProject, MetroStudioStation } from './metroStudioModel.js';

function readString(raw: unknown): string {
  return raw !== undefined && raw !== null ? String(raw).trim() : '';
}

function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

function parseStation(raw: unknown, index: number): MetroStudioStation | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: `第 ${index + 1} 个站点：必须是对象。` };
  }
  const o = raw as Record<string, unknown>;
  const id = readString(o.id);
  if (!id) {
    return { ok: false, message: `第 ${index + 1} 个站点：缺少 id。` };
  }
  return {
    id,
    nameZh: readString(o.nameZh),
    nameEn: readString(o.nameEn),
    lineIds: readStringArray(o.lineIds),
    transferLineIds: readStringArray(o.transferLineIds),
    isInterchange: o.isInterchange === true,
    underConstruction: o.underConstruction === true,
    proposed: o.proposed === true,
  };
}

function parseLine(raw: unknown, index: number): MetroStudioLine | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: `第 ${index + 1} 条线路：必须是对象。` };
  }
  const o = raw as Record<string, unknown>;
  const id = readString(o.id);
  if (!id) {
    return { ok: false, message: `第 ${index + 1} 条线路：缺少 id。` };
  }
  return {
    id,
    nameZh: readString(o.nameZh),
    nameEn: readString(o.nameEn),
    color: readString(o.color) || '#000000',
    isLoop: o.isLoop === true,
    edgeIds: readStringArray(o.edgeIds),
  };
}

function parseEdge(raw: unknown, index: number): MetroStudioEdge | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: `第 ${index + 1} 条边：必须是对象。` };
  }
  const o = raw as Record<string, unknown>;
  const id = readString(o.id);
  const fromStationId = readString(o.fromStationId);
  const toStationId = readString(o.toStationId);
  if (!id || !fromStationId || !toStationId) {
    return { ok: false, message: `第 ${index + 1} 条边：缺少 id / fromStationId / toStationId。` };
  }
  return {
    id,
    fromStationId,
    toStationId,
    sharedByLineIds: readStringArray(o.sharedByLineIds),
    lengthMeters: typeof o.lengthMeters === 'number' ? o.lengthMeters : undefined,
    isCurved: o.isCurved === true,
  };
}

export type ParseMetroStudioProjectResult =
  | { ok: true; project: MetroStudioProject }
  | { ok: false; message: string };

export function parseMetroStudioProject(raw: unknown): ParseMetroStudioProjectResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'Metro Studio 输入必须是 JSON 对象。' };
  }
  const root = raw as Record<string, unknown>;

  if (!Array.isArray(root.stations)) {
    return { ok: false, message: '缺少 stations 数组。' };
  }
  if (!Array.isArray(root.lines)) {
    return { ok: false, message: '缺少 lines 数组。' };
  }
  if (!Array.isArray(root.edges)) {
    return { ok: false, message: '缺少 edges 数组。' };
  }

  const stations: MetroStudioStation[] = [];
  for (let i = 0; i < root.stations.length; i += 1) {
    const parsed = parseStation(root.stations[i], i);
    if ('ok' in parsed) {
      return parsed;
    }
    stations.push(parsed);
  }

  const lines: MetroStudioLine[] = [];
  for (let i = 0; i < root.lines.length; i += 1) {
    const parsed = parseLine(root.lines[i], i);
    if ('ok' in parsed) {
      return parsed;
    }
    lines.push(parsed);
  }

  const edges: MetroStudioEdge[] = [];
  for (let i = 0; i < root.edges.length; i += 1) {
    const parsed = parseEdge(root.edges[i], i);
    if ('ok' in parsed) {
      return parsed;
    }
    edges.push(parsed);
  }

  return {
    ok: true,
    project: {
      name: readString(root.name) || undefined,
      stations,
      lines,
      edges,
    },
  };
}
