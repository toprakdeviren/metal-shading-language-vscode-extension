// server.ts — LSP entry point for Metal Shading Language.
// ──────────────────────────────────────────────────────────────────────────────
// Wires libmsl (via ./msl) into a vscode-languageserver instance. Responsible
// for three things:
//
//   1. Structured diagnostics — republished every time the document changes.
//   2. Semantic tokens — delivered on-demand to color identifiers, types, and
//      builtin functions with precise lexer-driven classification.
//   3. A custom `metal/transpile` request the extension uses to implement the
//      "Show Transpiled WGSL" command without re-loading the WASM module
//      inside the extension host process.
// ──────────────────────────────────────────────────────────────────────────────

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  SemanticTokensBuilder,
  type InitializeResult,
  type Diagnostic as LspDiagnostic,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { semanticTokens, transpile, type Diagnostic as MslDiagnostic } from './msl';
import {
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
  classify,
} from './tokens';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    semanticTokensProvider: {
      legend: {
        tokenTypes:     [...SEMANTIC_TOKEN_TYPES],
        tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
      },
      full: true,
    },
  },
  serverInfo: { name: 'metal-lsp', version: '1.0.0' },
}));

// ── Diagnostics ─────────────────────────────────────────────────────────────

function toLspSeverity(sev: MslDiagnostic['severity']): DiagnosticSeverity {
  switch (sev) {
    case 1: return DiagnosticSeverity.Error;
    case 2: return DiagnosticSeverity.Warning;
    case 3: return DiagnosticSeverity.Information;
    case 4: return DiagnosticSeverity.Hint;
  }
}

async function publishDiagnostics(doc: TextDocument): Promise<void> {
  try {
    const result = await transpile(doc.getText());
    const diagnostics: LspDiagnostic[] = result.diagnostics.map((d) => ({
      severity: toLspSeverity(d.severity),
      range: {
        // libmsl uses 1-based line/column; LSP expects 0-based.
        start: { line: Math.max(0, d.line - 1),    character: Math.max(0, d.column - 1) },
        end:   { line: Math.max(0, d.endLine - 1), character: Math.max(0, d.endColumn - 1) },
      },
      message: d.message,
      source:  'metal',
    }));
    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
  } catch (err) {
    connection.console.error(`transpile failed: ${String(err)}`);
  }
}

documents.onDidChangeContent((change) => {
  void publishDiagnostics(change.document);
});

documents.onDidClose((e) => {
  // Clear diagnostics when the document is closed so stale squiggles don't
  // linger in the Problems panel.
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// ── Semantic tokens ─────────────────────────────────────────────────────────

connection.languages.semanticTokens.on(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };

  const tokens = await semanticTokens(doc.getText());
  const builder = new SemanticTokensBuilder();
  for (const t of tokens) {
    const c = classify(t.kind);
    if (!c) continue;
    builder.push(t.line - 1, t.column - 1, t.length, c.typeIndex, c.modifiers);
  }
  return builder.build();
});

// ── Custom request: transpile current document → WGSL ──────────────────────

interface TranspileRequestParams {
  uri: string;
}

interface TranspileRequestResponse {
  ok:    boolean;
  wgsl:  string;
  error: string;
}

connection.onRequest(
  'metal/transpile',
  async (params: TranspileRequestParams): Promise<TranspileRequestResponse> => {
    const doc = documents.get(params.uri);
    if (!doc) return { ok: false, wgsl: '', error: 'document not found' };
    const result = await transpile(doc.getText());
    return { ok: result.ok, wgsl: result.wgsl, error: result.error };
  },
);

documents.listen(connection);
connection.listen();
