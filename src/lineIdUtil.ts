/** 形如「Line *」或「*号线」（* 仅字母数字）时返回 *，否则 null。 */
export function lineIdTokenFromNumberedName(s: string): string | null {
  const t = s.trim();
  if (!t) {
    return null;
  }
  const lineEn = t.match(/^Line\s*([A-Za-z0-9]+)\s*$/i);
  if (lineEn?.[1]) {
    return lineEn[1];
  }
  const lineZh = t.match(/^([A-Za-z0-9]+)\s*号线\s*$/);
  if (lineZh?.[1]) {
    return lineZh[1];
  }
  return null;
}

export function kyuriLineIdFromMetroStudioLine(nameZh: string, nameEn: string): string {
  const fromZh = lineIdTokenFromNumberedName(nameZh);
  if (fromZh !== null) {
    return normalizeKyuriLineId(fromZh);
  }
  const fromEn = lineIdTokenFromNumberedName(nameEn);
  if (fromEn !== null) {
    return normalizeKyuriLineId(fromEn);
  }
  const fallback = (nameZh.trim() || nameEn.trim() || '1').slice(0, 16);
  return normalizeKyuriLineId(fallback);
}

/** 纯数字或单字母+数字时去掉数字段前导 0。 */
export function normalizeKyuriLineId(lineId: string): string {
  const id = lineId.trim();
  const pure = /^(\d{1,2})$/.exec(id);
  if (pure) {
    return String(parseInt(pure[1]!, 10));
  }
  const letterNum = /^([a-zA-Z])(\d{1,2})$/.exec(id);
  if (letterNum) {
    return `${letterNum[1]}${String(parseInt(letterNum[2]!, 10))}`;
  }
  return id;
}

export function normalizeHexColor(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    return v.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const x = v.slice(1).toLowerCase();
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
  }
  return '#000000';
}

export function contrastTextColor(backgroundHex: string): string {
  const hex = normalizeHexColor(backgroundHex).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#ffffff';
}

type LineIdSortKey =
  | { kind: 'pure-num'; num: number; raw: string }
  | { kind: 'letter-num'; letter: string; num: number; raw: string }
  | { kind: 'other'; raw: string };

function lineIdSortKey(lineId: string): LineIdSortKey {
  const raw = lineId.trim();
  const pureNum = /^(\d+)$/.exec(raw);
  if (pureNum) {
    return { kind: 'pure-num', num: parseInt(pureNum[1]!, 10), raw };
  }
  const letterNum = /^([A-Za-z])(\d+)$/.exec(raw);
  if (letterNum) {
    return {
      kind: 'letter-num',
      letter: letterNum[1]!.toUpperCase(),
      num: parseInt(letterNum[2]!, 10),
      raw,
    };
  }
  return { kind: 'other', raw };
}

const LINE_ID_KIND_ORDER = { 'pure-num': 0, 'letter-num': 1, other: 2 } as const;

/**
 * 换乘线路编号排序：纯数字（数值）< 单字母+数字（字母 A–Z，再数值）< 其余（字典序）。
 * 例：1 < 3 < 11 < 23 < S1 < S3 < S11 < Z1 < Shanghai-fengxian
 */
export function compareKyuriLineIds(a: string, b: string): number {
  const ka = lineIdSortKey(a);
  const kb = lineIdSortKey(b);
  const kindDiff = LINE_ID_KIND_ORDER[ka.kind] - LINE_ID_KIND_ORDER[kb.kind];
  if (kindDiff !== 0) {
    return kindDiff;
  }
  if (ka.kind === 'pure-num' && kb.kind === 'pure-num') {
    return ka.num - kb.num;
  }
  if (ka.kind === 'letter-num' && kb.kind === 'letter-num') {
    if (ka.letter !== kb.letter) {
      return ka.letter.localeCompare(kb.letter);
    }
    return ka.num - kb.num;
  }
  return ka.raw.localeCompare(kb.raw, undefined, { sensitivity: 'case' });
}

export function sortKyuriLineIds(lineIds: string[]): string[] {
  return [...lineIds].sort(compareKyuriLineIds);
}

export function sortTransferLines<T extends { lineId: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => compareKyuriLineIds(a.lineId, b.lineId));
}
