import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runMetroStudioJsonToKyuriYaml } from '../conversionCore.js';
import { parseMetroStudioProject } from '../metroStudioParse.js';
import { METRO_STUDIO_TOPOLOGY_NOTICE, summarizeMetroStudioLines } from '../metroStudioToKyuri.js';
import type { MetroStudioLineSummary } from '../metroStudioModel.js';
import {
  CHILD_MSG_SOURCE,
  PARENT_MSG_SOURCE,
  postToParent,
  type ChildToParentMessage,
  type ParentToChildMessage,
} from './protocol.js';

function useEmbedMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('hideOutput') === '1';
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickDefaultLineId(lines: MetroStudioLineSummary[]): string {
  const supported = lines.filter((line) => line.supported);
  return supported[0]?.id ?? lines[0]?.id ?? '';
}

export function App() {
  const embed = useEmbedMode();
  const inIframe = typeof window !== 'undefined' && window.parent !== window;

  const [metroStudioIn, setMetroStudioIn] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [kyuriOut, setKyuriOut] = useState('');
  const [parseError, setParseError] = useState('');

  const lineSummaries = useMemo(() => {
    if (!metroStudioIn.trim()) {
      return [] as MetroStudioLineSummary[];
    }
    try {
      const raw = JSON.parse(metroStudioIn);
      const parsed = parseMetroStudioProject(raw);
      if (!parsed.ok) {
        setParseError(parsed.message);
        return [];
      }
      setParseError('');
      return summarizeMetroStudioLines(parsed.project);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      return [];
    }
  }, [metroStudioIn]);

  useEffect(() => {
    if (lineSummaries.length === 0) {
      setSelectedLineId('');
      return;
    }
    if (!selectedLineId || !lineSummaries.some((line) => line.id === selectedLineId)) {
      setSelectedLineId(pickDefaultLineId(lineSummaries));
    }
  }, [lineSummaries, selectedLineId]);

  useEffect(() => {
    postToParent({ source: CHILD_MSG_SOURCE, type: 'ready' });
  }, []);

  const emitOk = useCallback(
    (msg: Extract<ChildToParentMessage, { type: 'result'; ok: true }>) => {
      if (inIframe) {
        postToParent(msg);
      }
    },
    [inIframe],
  );

  const emitErr = useCallback(
    (message: string) => {
      if (inIframe) {
        postToParent({
          source: CHILD_MSG_SOURCE,
          type: 'result',
          mode: 'metro-studio-to-kyuri',
          ok: false,
          message,
        });
      }
    },
    [inIframe],
  );

  const convertMetroStudioToKyuri = useCallback(() => {
    if (!selectedLineId) {
      const msg = '请选择要导入的线路。';
      emitErr(msg);
      if (!(embed && inIframe)) {
        window.alert(msg);
      }
      return;
    }

    const selected = lineSummaries.find((line) => line.id === selectedLineId);
    if (selected && !selected.supported) {
      const msg = selected.unsupportedReason ?? '所选线路不可导入。';
      emitErr(msg);
      if (!(embed && inIframe)) {
        window.alert(msg);
      }
      return;
    }

    const r = runMetroStudioJsonToKyuriYaml(metroStudioIn, selectedLineId);
    if (!r.ok) {
      emitErr(r.message);
      if (!(embed && inIframe)) {
        window.alert(r.message);
      }
      return;
    }

    const w = r.warnings.map((x) => x.message);
    setKyuriOut(r.yaml);
    emitOk({
      source: CHILD_MSG_SOURCE,
      type: 'result',
      mode: 'metro-studio-to-kyuri',
      ok: true,
      yaml: r.yaml,
      warnings: w,
    });
  }, [metroStudioIn, selectedLineId, lineSummaries, embed, inIframe, emitOk, emitErr]);

  const convertRef = useRef(convertMetroStudioToKyuri);
  convertRef.current = convertMetroStudioToKyuri;
  const selectedLineIdRef = useRef(selectedLineId);
  selectedLineIdRef.current = selectedLineId;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as ParentToChildMessage;
      if (!d || d.source !== PARENT_MSG_SOURCE) {
        return;
      }
      if (d.type === 'setMetroStudioJson') {
        setMetroStudioIn(d.json);
        if (d.lineId) {
          setSelectedLineId(d.lineId);
        }
        if (d.thenConvert) {
          window.setTimeout(() => convertRef.current(), 0);
        }
      }
      if (d.type === 'convert' && d.mode === 'metro-studio-to-kyuri') {
        if (d.lineId) {
          setSelectedLineId(d.lineId);
        }
        window.setTimeout(() => convertRef.current(), 0);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div className="app-root">
      <h1 className="app-title">Metro Studio → Kyuri naive</h1>
      <p className="topology-notice" role="note">
        {METRO_STUDIO_TOPOLOGY_NOTICE}
      </p>
      <p className="app-note">
        {embed
          ? '由线路图页面打开；转换结果会回到该页面。'
          : '将 Metro Studio 项目 JSON 中的单条直线线路转为 Kyuri naive 3.0 YAML。'}
      </p>

      <section className="section" aria-labelledby="h-metro-studio">
        <h2 id="h-metro-studio">Metro Studio 项目 JSON</h2>
        <label className="field-label" htmlFor="metro-studio-in">
          粘贴或上传 .metro-studio / .json 后选择线路并转换
        </label>
        <textarea
          id="metro-studio-in"
          className="mono-area"
          value={metroStudioIn}
          onChange={(ev) => setMetroStudioIn(ev.target.value)}
          spellCheck={false}
        />
        {parseError ? <p className="field-error">{parseError}</p> : null}
        {lineSummaries.length > 0 ? (
          <label className="field-label" htmlFor="line-select" style={{ marginTop: 10 }}>
            导入线路
          </label>
        ) : null}
        {lineSummaries.length > 0 ? (
          <select
            id="line-select"
            className="line-select"
            value={selectedLineId}
            onChange={(ev) => setSelectedLineId(ev.target.value)}
          >
            {lineSummaries.map((line) => (
              <option key={line.id} value={line.id} disabled={!line.supported}>
                {line.label}
                {line.supported ? `（${line.stationCount} 站）` : `（不可导入：${line.unsupportedReason ?? '不支持'}）`}
              </option>
            ))}
          </select>
        ) : null}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={convertMetroStudioToKyuri}>
            转换
          </button>
          <label className="btn">
            上传 JSON
            <input
              type="file"
              accept=".json,.metro-studio,application/json"
              className="visually-hidden"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = '';
                if (!f) {
                  return;
                }
                void f.text().then(setMetroStudioIn);
              }}
            />
          </label>
          {!embed && kyuriOut ? (
            <button type="button" className="btn" onClick={() => downloadText('kyuri-naive.yml', kyuriOut, 'text/yaml')}>
              下载 YAML
            </button>
          ) : null}
        </div>
        {!embed ? (
          <>
            <div className="divider" />
            <label className="field-label" htmlFor="kyuri-out">
              Kyuri naive 3.0 YAML
            </label>
            <textarea id="kyuri-out" className="mono-area" readOnly value={kyuriOut} spellCheck={false} />
          </>
        ) : null}
      </section>

      <footer className="license">
        本软件以 <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3</a> 发布。
      </footer>
    </div>
  );
}
