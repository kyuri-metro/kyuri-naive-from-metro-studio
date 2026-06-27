import type { KyuriNaiveDocV3, KyuriStation, StationType, TransferLine } from './kyuriModel.js';
import { KYURI_NAIVE_SCHEMA } from './schema.js';
import {
  contrastTextColor,
  kyuriLineIdFromMetroStudioLine,
  normalizeHexColor,
  sortTransferLines,
} from './lineIdUtil.js';
import type { MetroStudioEdge, MetroStudioLine, MetroStudioLineSummary, MetroStudioProject } from './metroStudioModel.js';

export type MetroStudioToKyuriWarningCode = 'topology-only';

/** 每次成功转换时一并返回，供 CLI / iframe 父页展示。 */
export const METRO_STUDIO_TOPOLOGY_NOTICE = '本工具只处理拓扑连接与站序，不考虑线路几何走向。';

export type MetroStudioToKyuriResult =
  | {
      ok: true;
      doc: KyuriNaiveDocV3;
      warnings: { code: MetroStudioToKyuriWarningCode; message: string }[];
    }
  | { ok: false; message: string };

const slugId = (zh: string, en: string, index: number): string => {
  const base = (en.trim() || zh.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (base.length > 0) {
    return base.slice(0, 48);
  }
  return `station-${index}`;
};

const sanitizeId = (raw: string): string =>
  raw.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64) || 'station';

const ensureUniqueIds = (stations: KyuriStation[]): KyuriStation[] => {
  const seen = new Set<string>();
  return stations.map((station, index) => {
    let id = station.id?.trim() ? station.id : slugId(station.chName, station.enName, index);
    id = sanitizeId(id);
    let n = 0;
    let candidate = id;
    while (seen.has(candidate)) {
      n += 1;
      candidate = `${id}-${n}`;
    }
    seen.add(candidate);
    return { ...station, id: candidate };
  });
};

function metroStationType(nameEn: string): StationType {
  const en = nameEn.toLowerCase();
  if (en.includes('railway station') || en.includes(' railway ')) {
    return 'railway';
  }
  if (en.includes('airport')) {
    return 'airport';
  }
  return 'none';
}

function validateStraightLineTopology(
  line: MetroStudioLine,
  edgesById: Map<string, MetroStudioEdge>,
): string | null {
  if (line.isLoop) {
    return `线路「${line.nameZh || line.nameEn || line.id}」为环线，不支持。`;
  }
  if (line.edgeIds.length === 0) {
    return `线路「${line.nameZh || line.nameEn || line.id}」没有边。`;
  }

  const edges: MetroStudioEdge[] = [];
  for (const edgeId of line.edgeIds) {
    const edge = edgesById.get(edgeId);
    if (!edge) {
      return `线路「${line.nameZh || line.nameEn || line.id}」引用了不存在的边 ${edgeId}。`;
    }
    edges.push(edge);
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.fromStationId, (degree.get(edge.fromStationId) ?? 0) + 1);
    degree.set(edge.toStationId, (degree.get(edge.toStationId) ?? 0) + 1);
  }

  for (const [, d] of degree) {
    if (d > 2) {
      return `线路「${line.nameZh || line.nameEn || line.id}」存在分支（支线），不支持。`;
    }
  }

  const endpointCount = [...degree.values()].filter((d) => d === 1).length;
  if (endpointCount !== 2) {
    return `线路「${line.nameZh || line.nameEn || line.id}」不是简单直线（端点数为 ${endpointCount}）。`;
  }

  return null;
}

function orderStationIdsAlongLine(
  line: MetroStudioLine,
  edgesById: Map<string, MetroStudioEdge>,
): string[] | null {
  const edges: MetroStudioEdge[] = [];
  for (const edgeId of line.edgeIds) {
    const edge = edgesById.get(edgeId);
    if (!edge) {
      return null;
    }
    edges.push(edge);
  }
  if (edges.length === 0) {
    return null;
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const fromNeighbors = adjacency.get(edge.fromStationId) ?? [];
    fromNeighbors.push(edge.toStationId);
    adjacency.set(edge.fromStationId, fromNeighbors);

    const toNeighbors = adjacency.get(edge.toStationId) ?? [];
    toNeighbors.push(edge.fromStationId);
    adjacency.set(edge.toStationId, toNeighbors);
  }

  const walkFrom = (startStationId: string): string[] => {
    const ordered = [startStationId];
    let previous: string | null = null;
    let current = startStationId;

    while (true) {
      const neighbors = adjacency.get(current) ?? [];
      const next = neighbors.find((neighbor) => neighbor !== previous);
      if (!next) {
        break;
      }
      ordered.push(next);
      previous = current;
      current = next;
    }

    return ordered;
  };

  const endpoints = [...adjacency.entries()]
    .filter(([, neighbors]) => neighbors.length === 1)
    .map(([id]) => id);

  for (const start of endpoints) {
    const walk = walkFrom(start);
    if (walk.length === adjacency.size) {
      return walk;
    }
  }

  return null;
}

function buildTransferLines(
  stationLineIds: string[],
  currentLineId: string,
  linesById: Map<string, MetroStudioLine>,
): TransferLine[] {
  const out: TransferLine[] = [];
  const seen = new Set<string>();

  for (const metroLineId of stationLineIds) {
    if (metroLineId === currentLineId) {
      continue;
    }
    const other = linesById.get(metroLineId);
    if (!other) {
      continue;
    }
    const lineId = kyuriLineIdFromMetroStudioLine(other.nameZh, other.nameEn);
    if (seen.has(lineId)) {
      continue;
    }
    seen.add(lineId);
    const color = normalizeHexColor(other.color);
    out.push({ lineId, color, textColor: contrastTextColor(color) });
  }

  return sortTransferLines(out);
}

function countStationsOnLine(line: MetroStudioLine, edgesById: Map<string, MetroStudioEdge>): number {
  const stationIds = orderStationIdsAlongLine(line, edgesById);
  return stationIds?.length ?? 0;
}

export function summarizeMetroStudioLines(project: MetroStudioProject): MetroStudioLineSummary[] {
  const edgesById = new Map(project.edges.map((edge) => [edge.id, edge]));

  return project.lines.map((line) => {
    const label = line.nameZh.trim() || line.nameEn.trim() || line.id;
    const topoError = validateStraightLineTopology(line, edgesById);
    if (topoError) {
      return {
        id: line.id,
        label,
        stationCount: 0,
        supported: false,
        unsupportedReason: topoError,
      };
    }
    const ordered = orderStationIdsAlongLine(line, edgesById)!;
    return {
      id: line.id,
      label,
      stationCount: ordered.length,
      supported: true,
    };
  });
}

export function metroStudioProjectToKyuriNaive(
  project: MetroStudioProject,
  selectedLineId: string,
): MetroStudioToKyuriResult {
  const linesById = new Map(project.lines.map((line) => [line.id, line]));
  const edgesById = new Map(project.edges.map((edge) => [edge.id, edge]));
  const stationsById = new Map(project.stations.map((station) => [station.id, station]));

  const line = linesById.get(selectedLineId);
  if (!line) {
    return { ok: false, message: `未找到线路 id：${selectedLineId}` };
  }

  const topoError = validateStraightLineTopology(line, edgesById);
  if (topoError) {
    return { ok: false, message: topoError };
  }

  const orderedStationIds = orderStationIdsAlongLine(line, edgesById)!;

  const warnings: { code: MetroStudioToKyuriWarningCode; message: string }[] = [
    { code: 'topology-only', message: METRO_STUDIO_TOPOLOGY_NOTICE },
  ];

  const kyuriStations: KyuriStation[] = [];
  for (let i = 0; i < orderedStationIds.length; i += 1) {
    const metroStationId = orderedStationIds[i]!;
    const metroStation = stationsById.get(metroStationId);
    if (!metroStation) {
      return { ok: false, message: `边链引用了不存在的站点 ${metroStationId}。` };
    }

    const transferSource =
      metroStation.transferLineIds.length > 0 ? metroStation.transferLineIds : metroStation.lineIds;

    kyuriStations.push({
      id: slugId(metroStation.nameZh, metroStation.nameEn, i),
      chName: metroStation.nameZh,
      enName: metroStation.nameEn,
      type: metroStationType(metroStation.nameEn),
      transfer: buildTransferLines(transferSource, line.id, linesById),
    });
  }

  const stations = ensureUniqueIds(kyuriStations);
  const lineColor = normalizeHexColor(line.color);
  const lineId = kyuriLineIdFromMetroStudioLine(line.nameZh, line.nameEn);

  const doc: KyuriNaiveDocV3 = {
    version: 3,
    schema: KYURI_NAIVE_SCHEMA,
    direction: 'l',
    currentStnId: stations[0]?.id ?? '',
    lineId,
    color: lineColor,
    textColor: contrastTextColor(lineColor),
    stations,
  };

  return { ok: true, doc, warnings };
}

export function countLineStations(project: MetroStudioProject, lineId: string): number {
  const line = project.lines.find((item) => item.id === lineId);
  if (!line) {
    return 0;
  }
  const edgesById = new Map(project.edges.map((edge) => [edge.id, edge]));
  return countStationsOnLine(line, edgesById);
}
