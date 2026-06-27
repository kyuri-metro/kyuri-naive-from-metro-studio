import { parseMetroStudioProject } from './metroStudioParse.js';
import { metroStudioProjectToKyuriNaive } from './metroStudioToKyuri.js';
import { serializeKyuriDoc } from './yamlKyuri.js';

export type MetroStudioToKyuriCoreResult =
  | { ok: true; yaml: string; warnings: { code: string; message: string }[] }
  | { ok: false; message: string };

export function runMetroStudioJsonToKyuriYaml(
  metroStudioJsonText: string,
  selectedLineId: string,
): MetroStudioToKyuriCoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(metroStudioJsonText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `JSON 解析失败：${msg}` };
  }

  const parsed = parseMetroStudioProject(raw);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  const conv = metroStudioProjectToKyuriNaive(parsed.project, selectedLineId);
  if (!conv.ok) {
    return { ok: false, message: conv.message };
  }

  return {
    ok: true,
    yaml: serializeKyuriDoc(conv.doc),
    warnings: conv.warnings,
  };
}
