import YAML from 'yaml';
import { KYURI_NAIVE_SCHEMA } from './schema.js';
import type { KyuriNaiveDocV3, KyuriStation, StationType, TrainDirection, TransferLine } from './kyuriModel.js';

const STATION_TYPES = new Set<StationType>(['none', 'railway', 'airport']);

const normalizeHex = (raw: string): string => {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    return v.toLowerCase();
  }
  return '#000000';
};

const isValidHex6 = (raw: unknown): raw is string =>
  typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.trim());

const parseNameBlock = (raw: unknown): { zh: string; en: string } | null => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    let zh = '';
    let en = '';
    for (const item of raw) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        if ('zh' in o && o.zh !== undefined) {
          zh = String(o.zh);
        }
        if ('en' in o && o.en !== undefined) {
          en = String(o.en);
        }
      }
    }
    return { zh, en };
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      zh: o.zh !== undefined ? String(o.zh) : '',
      en: o.en !== undefined ? String(o.en) : '',
    };
  }
  return null;
};

const parseTransferBlock = (
  raw: unknown,
  stationIndex: number,
): TransferLine[] | { ok: false; message: string } => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: TransferLine[] = [];

  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const lineRaw = o.lineId ?? o.id;
    if (lineRaw === undefined || lineRaw === null) {
      continue;
    }
    const id = String(lineRaw).trim();
    if (!id) {
      continue;
    }
    const color = normalizeHex(o.color !== undefined && o.color !== null ? String(o.color) : '#000000');

    const textRaw = o.textColor;
    if (!isValidHex6(textRaw)) {
      return {
        ok: false,
        message: `第 ${stationIndex + 1} 个站点：每条换乘须包含有效的 textColor（#RRGGBB）。`,
      };
    }
    out.push({ lineId: id, color, textColor: normalizeHex(textRaw) });
  }
  return out;
};

const parseType = (raw: unknown): StationType => {
  const s = String(raw ?? 'none').trim();
  if (STATION_TYPES.has(s as StationType)) {
    return s as StationType;
  }
  return 'none';
};

const sanitizeId = (raw: string): string =>
  raw.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64) || 'station';

const slugId = (zh: string, en: string, index: number): string => {
  const base = (en.trim() || zh.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (base.length > 0) {
    return base.slice(0, 48);
  }
  return `station-${index}`;
};

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

const parseStationsYamlArray = (
  data: unknown[],
): { ok: true; stations: KyuriStation[] } | { ok: false; message: string } => {
  if (data.length === 0) {
    return { ok: false, message: '站点列表为空。' };
  }
  const stations: KyuriStation[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      return { ok: false, message: `第 ${i + 1} 个站点：必须是对象。` };
    }
    const o = row as Record<string, unknown>;
    const names = parseNameBlock(o.name);
    if (!names) {
      return { ok: false, message: `第 ${i + 1} 个站点：缺少有效的 name（zh / en）。` };
    }
    const idRaw = o.id !== undefined && o.id !== null ? String(o.id).trim() : '';
    const fromRaw = idRaw ? sanitizeId(idRaw) : '';
    const id = fromRaw || slugId(names.zh, names.en, i);
    const transferResult = parseTransferBlock(o.transfer, i);
    if (!Array.isArray(transferResult)) {
      return transferResult;
    }
    stations.push({
      id,
      chName: names.zh,
      enName: names.en,
      type: parseType(o.type),
      transfer: transferResult,
    });
  }
  return { ok: true, stations: ensureUniqueIds(stations) };
};

const resolveCurrentStnId = (requested: string, stations: KyuriStation[], fallback: string): string => {
  if (stations.length === 0) {
    return '';
  }
  if (requested && stations.some((s) => s.id === requested)) {
    return requested;
  }
  if (fallback && stations.some((s) => s.id === fallback)) {
    return fallback;
  }
  return stations[0]!.id;
};

export type ParseKyuriYamlFallbacks = {
  direction?: TrainDirection;
  currentStnId?: string;
};

const DEFAULT_FB: Required<ParseKyuriYamlFallbacks> = {
  direction: 'l',
  currentStnId: '',
};

export type ParseKyuriYamlResult = { ok: true; doc: KyuriNaiveDocV3 } | { ok: false; message: string };

function isVersion3Field(raw: unknown): boolean {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  return n === 3;
}

/** 解析 Kyuri naive 3.0 YAML（仅 version: 3） */
export function parseKyuriYaml(text: string, fallbacks: Partial<ParseKyuriYamlFallbacks> = {}): ParseKyuriYamlResult {
  const fb: Required<ParseKyuriYamlFallbacks> = { ...DEFAULT_FB, ...fallbacks };
  let data: unknown;
  try {
    data = YAML.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `YAML 解析失败：${msg}` };
  }

  if (Array.isArray(data)) {
    return {
      ok: false,
      message: '仅支持根为对象的 Kyuri naive 3.0 YAML（version: 3），不支持以站点数组为根的旧版格式。',
    };
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: '根节点必须是对象。' };
  }

  const root = data as Record<string, unknown>;
  if (!('stations' in root)) {
    return { ok: false, message: '缺少 stations 字段。' };
  }
  if (!isVersion3Field(root.version)) {
    return { ok: false, message: '不支持的 version：仅支持 3（Kyuri naive 3.0）。' };
  }

  const rawStations = root.stations;
  if (!Array.isArray(rawStations)) {
    return { ok: false, message: 'stations 必须是数组。' };
  }
  const stationsResult = parseStationsYamlArray(rawStations);
  if (!stationsResult.ok) {
    return stationsResult;
  }
  const stations = stationsResult.stations;

  const lineIdRaw = root.lineId !== undefined && root.lineId !== null ? String(root.lineId).trim() : '';
  const lineId = lineIdRaw !== '' ? lineIdRaw : '1';

  let color: string;
  if (typeof root.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(root.color.trim())) {
    color = normalizeHex(root.color);
  } else {
    color = '#000000';
  }

  if (!isValidHex6(root.textColor)) {
    return { ok: false, message: '根字段 textColor（#RRGGBB）必填。' };
  }
  const textColor = normalizeHex(String(root.textColor));

  const schemaRaw = root.schema;
  const schemaStr = typeof schemaRaw === 'string' ? schemaRaw.trim() : '';
  if (schemaStr && schemaStr !== KYURI_NAIVE_SCHEMA) {
    return {
      ok: false,
      message: `schema 与预期不符：期望 ${KYURI_NAIVE_SCHEMA}，实际为 ${schemaStr}`,
    };
  }

  let direction: TrainDirection = fb.direction;
  if (root.direction === 'l' || root.direction === 'r') {
    direction = root.direction;
  }
  let currentFromRoot = typeof root.currentStnId === 'string' ? root.currentStnId.trim() : '';
  const njRaw = root.njMetroSettings;
  if (
    !currentFromRoot &&
    njRaw !== null &&
    typeof njRaw === 'object' &&
    !Array.isArray(njRaw) &&
    typeof (njRaw as Record<string, unknown>).currentStnId === 'string'
  ) {
    currentFromRoot = String((njRaw as Record<string, unknown>).currentStnId).trim();
  }
  const currentStnId = resolveCurrentStnId(currentFromRoot || fb.currentStnId, stations, fb.currentStnId);

  const doc: KyuriNaiveDocV3 = {
    version: 3,
    schema: KYURI_NAIVE_SCHEMA,
    direction,
    currentStnId,
    lineId,
    color,
    textColor,
    stations,
  };
  return { ok: true, doc };
}

export function serializeKyuriDoc(doc: KyuriNaiveDocV3): string {
  if (doc.version !== 3) {
    throw new Error('serializeKyuriDoc 仅支持 Kyuri naive 3.0（version: 3）。');
  }
  const stationsBodies = doc.stations.map((station) => ({
    id: station.id,
    name: [{ zh: station.chName }, { en: station.enName }],
    type: station.type,
    transfer: station.transfer.map((line) => ({
      lineId: line.lineId,
      color: normalizeHex(line.color),
      textColor: normalizeHex(line.textColor),
    })),
  }));

  const body = {
    version: 3,
    schema: doc.schema,
    direction: doc.direction,
    currentStnId: doc.currentStnId,
    lineId: doc.lineId,
    color: normalizeHex(doc.color),
    textColor: normalizeHex(doc.textColor),
    stations: stationsBodies,
  };
  return YAML.stringify(body, { indent: 2, lineWidth: 0 }).trimEnd() + '\n';
}
