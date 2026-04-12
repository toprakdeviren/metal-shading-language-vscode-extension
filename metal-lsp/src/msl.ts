// msl.ts — typed wrapper around the libmsl WASM module.
// ──────────────────────────────────────────────────────────────────────────────
// The Emscripten build (`make wasm`) emits `msl_compiler.js`, a MODULARIZE'd
// factory that returns a Promise<Module>. We load it lazily once per process
// and expose two high-level operations the LSP needs:
//
//   • lex(src)        → flat token stream with kind + position
//   • transpile(src)  → WGSL text, JSON metadata, structured diagnostics
//
// Each call crosses the JS ↔ WASM boundary through ccall() rather than raw
// memory reads so we don't have to track the Emscripten HEAP layout.
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

// Locate the Emscripten bundle. Two layouts are supported:
//
//   • Dev:     editor/metal-lsp/out/server.js loads ../wasm/msl_compiler.js
//   • Bundled: editor/vscode-metal/out/server.js loads ./wasm/msl_compiler.js
//               (vsce-packaged extension — metal-lsp has been inlined with
//               esbuild and its WASM directory copied alongside)
//
// We pick whichever exists at load time so the same compiled server works
// in both modes without a build-time flag.
function resolveWasmJs(): string {
  const candidates = [
    path.join(__dirname, 'wasm', 'msl_compiler.js'),          // bundled
    path.join(__dirname, '..', 'wasm', 'msl_compiler.js'),    // dev
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `metal-lsp: could not find msl_compiler.js (looked in: ${candidates.join(', ')})`,
  );
}

const wasmJs = resolveWasmJs();
const wasmDir = path.dirname(wasmJs);

// Emscripten MODULARIZE factories don't ship types. Import via require() to
// dodge TS ESM-vs-CJS bikeshedding; the .js file is plain CommonJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MSLModuleFactory: (opts?: { locateFile?: (f: string) => string }) => Promise<EmModule> =
  require(wasmJs);

interface EmModule {
  ccall: (name: string, ret: string | null, types: string[], args: unknown[]) => unknown;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
}

let modulePromise: Promise<EmModule> | null = null;

function getModule(): Promise<EmModule> {
  if (!modulePromise) {
    modulePromise = MSLModuleFactory({
      // Point the loader at our bundled .wasm file, regardless of cwd.
      locateFile: (f: string) => path.join(wasmDir, f),
    });
  }
  return modulePromise;
}

// Must mirror MSLLexTokenKind in include/metal.h. Exposed so callers can
// switch on named constants instead of raw integers.
export const LexKind = {
  UNKNOWN:       0,
  IDENTIFIER:    1,
  KEYWORD:       2,
  TYPE:          3,
  BUILTIN_FUNC:  4,
  NUMBER:        5,
  STRING:        6,
  CHAR:          7,
  OPERATOR:      8,
  PUNCT:         9,
  ATTRIBUTE:    10,
  PREPROCESSOR: 11,
  COMMENT:      12,
  // Parser-enriched kinds (msl_semantic_tokens only)
  STRUCT_NAME:  13,
  FUNCTION:     14,
  FIELD:        15,
  PARAMETER:    16,
  VARIABLE:     17,
} as const;

export interface LexToken {
  kind:   number;
  offset: number;
  length: number;
  line:   number;   // 1-based
  column: number;   // 1-based
}

export interface Diagnostic {
  severity:  1 | 2 | 3 | 4;   // 1=error, 2=warn, 3=info, 4=hint
  line:      number;
  column:    number;
  endLine:   number;
  endColumn: number;
  message:   string;
}

export interface TranspileResult {
  ok:          boolean;
  wgsl:        string;
  json:        string;
  error:       string;
  diagnostics: Diagnostic[];
}

/** Lex-only token stream (fast, no parser). */
export async function lex(src: string): Promise<LexToken[]> {
  return readTokens(await getModule(), 'msl_lex_wasm', src);
}

/** Parser-enriched token stream: struct / function / parameter / field /
 *  variable kinds are filled in from the AST. Falls back to lexer-only kinds
 *  when the parse fails. */
export async function semanticTokens(src: string): Promise<LexToken[]> {
  return readTokens(await getModule(), 'msl_semantic_tokens_wasm', src);
}

function readTokens(m: EmModule, fn: string, src: string): LexToken[] {
  const handle = m.ccall(fn, 'number', ['string'], [src]) as number;
  if (!handle) return [];
  try {
    const count = m.ccall('msl_lex_count', 'number', ['number'], [handle]) as number;
    const tokens: LexToken[] = new Array(count);
    for (let i = 0; i < count; i++) {
      tokens[i] = {
        kind:   m.ccall('msl_lex_kind',   'number', ['number', 'number'], [handle, i]) as number,
        offset: m.ccall('msl_lex_offset', 'number', ['number', 'number'], [handle, i]) as number,
        length: m.ccall('msl_lex_length', 'number', ['number', 'number'], [handle, i]) as number,
        line:   m.ccall('msl_lex_line',   'number', ['number', 'number'], [handle, i]) as number,
        column: m.ccall('msl_lex_column', 'number', ['number', 'number'], [handle, i]) as number,
      };
    }
    return tokens;
  } finally {
    m.ccall('msl_lex_free_wasm', null, ['number'], [handle]);
  }
}

export async function transpile(src: string): Promise<TranspileResult> {
  const m = await getModule();
  const r = m.ccall('msl_compile_wasm', 'number', ['string', 'number'], [src, src.length]) as number;
  try {
    const ok    = (m.ccall('msl_result_ok',   'number', ['number'], [r]) as number) === 1;
    const wgsl  = m.ccall('msl_result_wgsl',  'string', ['number'], [r]) as string;
    const json  = m.ccall('msl_result_mir',   'string', ['number'], [r]) as string;
    const error = m.ccall('msl_result_error', 'string', ['number'], [r]) as string;

    const dcount = m.ccall('msl_result_diagnostic_count', 'number', ['number'], [r]) as number;
    const diagnostics: Diagnostic[] = [];
    for (let i = 0; i < dcount; i++) {
      diagnostics.push({
        severity:  m.ccall('msl_result_diagnostic_severity',   'number', ['number', 'number'], [r, i]) as 1 | 2 | 3 | 4,
        line:      m.ccall('msl_result_diagnostic_line',       'number', ['number', 'number'], [r, i]) as number,
        column:    m.ccall('msl_result_diagnostic_column',     'number', ['number', 'number'], [r, i]) as number,
        endLine:   m.ccall('msl_result_diagnostic_end_line',   'number', ['number', 'number'], [r, i]) as number,
        endColumn: m.ccall('msl_result_diagnostic_end_column', 'number', ['number', 'number'], [r, i]) as number,
        message:   m.ccall('msl_result_diagnostic_message',    'string', ['number', 'number'], [r, i]) as string,
      });
    }
    return { ok, wgsl, json, error, diagnostics };
  } finally {
    m.ccall('msl_result_free', null, ['number'], [r]);
  }
}
