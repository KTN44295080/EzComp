import { it, expect } from 'vitest';
import ts from 'typescript';

it('typechecks the complete EzComp project with Grounding enabled', () => {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('tsconfig.json is missing');
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, process.cwd());
  const program = ts.createProgram(config.fileNames, { ...config.options, noEmit: true, incremental: false });
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  const host: ts.FormatDiagnosticsHost = { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' };
  expect(ts.formatDiagnostics(diagnostics, host)).toBe('');
}, 60000);
