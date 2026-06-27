#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runMetroStudioJsonToKyuriYaml } from './conversionCore.js';
import { parseMetroStudioProject } from './metroStudioParse.js';
import { summarizeMetroStudioLines } from './metroStudioToKyuri.js';

const USAGE = `kyuri-metro-studio — Metro Studio ↔ Kyuri naive 3.0

用法:
  kyuri-metro-studio metro-studio-to-kyuri <输入.json> <输出.yaml> [--line <Metro Studio 线路 id>]
      将 Metro Studio 项目 JSON 中的单条直线线路导出为 Kyuri naive 3.0 YAML。
      未指定 --line 时，若仅有一条可导入线路则自动选用；否则列出可用线路并退出。

  kyuri-metro-studio list-lines <输入.json>
      列出项目中各线路是否可导入及站点数。
`;

function readUtf8(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readLineFlag(argv: string[]): string | undefined {
  const idx = argv.indexOf('--line');
  if (idx === -1) {
    return undefined;
  }
  return argv[idx + 1]?.trim() || undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  const cmd = argv[0];

  if (cmd === 'list-lines') {
    if (argv.length < 2) {
      die('参数不足：list-lines <输入.json>');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readUtf8(argv[1]!));
    } catch (e) {
      die(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
    const parsed = parseMetroStudioProject(raw);
    if (!parsed.ok) {
      die(parsed.message);
    }
    for (const line of summarizeMetroStudioLines(parsed.project)) {
      if (line.supported) {
        console.log(`${line.id}\t${line.label}\t${line.stationCount} 站\t可导入`);
      } else {
        console.log(`${line.id}\t${line.label}\t-\t${line.unsupportedReason ?? '不可导入'}`);
      }
    }
    return;
  }

  if (cmd === 'metro-studio-to-kyuri') {
    const positional = argv.filter((arg, index) => arg !== '--line' && argv[index - 1] !== '--line');
    if (positional.length < 3) {
      die('参数不足：metro-studio-to-kyuri <输入.json> <输出.yaml> [--line <线路 id>]');
    }

    const jsonText = readUtf8(positional[1]!);
    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch (e) {
      die(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
    const parsed = parseMetroStudioProject(raw);
    if (!parsed.ok) {
      die(parsed.message);
    }

    let selectedLineId = readLineFlag(argv);
    const summaries = summarizeMetroStudioLines(parsed.project).filter((line) => line.supported);
    if (!selectedLineId) {
      if (summaries.length === 1) {
        selectedLineId = summaries[0]!.id;
      } else if (summaries.length === 0) {
        die('项目中没有可导入的直线线路。');
      } else {
        die(
          `项目含 ${summaries.length} 条可导入线路，请用 --line 指定其一：\n${summaries.map((line) => `  ${line.id}  ${line.label} (${line.stationCount} 站)`).join('\n')}`,
        );
      }
    }

    const conv = runMetroStudioJsonToKyuriYaml(jsonText, selectedLineId);
    if (!conv.ok) {
      die(conv.message);
    }
    for (const w of conv.warnings) {
      console.error(`[${w.code}] ${w.message}`);
    }
    writeFileSync(resolve(positional[2]!), conv.yaml, 'utf8');
    console.error('已写入', resolve(positional[2]!));
    return;
  }

  die(`未知子命令：${cmd}\n\n${USAGE}`);
}

main();
