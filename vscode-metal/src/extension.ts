// extension.ts — VSCode extension entry point for Metal Shading Language.
// ──────────────────────────────────────────────────────────────────────────────
// Starts the metal-lsp language server (sibling workspace package), wires
// the client to .metal / .msl buffers, and registers the `metal.showWGSL`
// command that asks the server to transpile the active document and opens
// the result in a side panel.
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';
import { PreviewPanel } from './preview';

let client: LanguageClient | undefined;

/** Locate the language-server entry point.
 *
 *   • Bundled (.vsix install): the esbuild step inlines metal-lsp into
 *     `out/server.js` next to this file, with its WASM copied into
 *     `out/wasm/`.
 *   • Dev (F5 in the workspace): the sibling `metal-lsp` package is compiled
 *     by tsc and the extension reaches it through a relative path. */
function resolveServerModule(context: vscode.ExtensionContext): string {
  const bundled = context.asAbsolutePath(path.join('out', 'server.js'));
  if (fs.existsSync(bundled)) return bundled;
  return context.asAbsolutePath(path.join('..', 'metal-lsp', 'out', 'server.js'));
}

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = resolveServerModule(context);

  const serverOptions: ServerOptions = {
    run:   { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file',     language: 'metal' },
      { scheme: 'untitled', language: 'metal' },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{metal,msl}'),
    },
  };

  client = new LanguageClient(
    'metal',
    'Metal Language Server',
    serverOptions,
    clientOptions,
  );
  client.start();

  context.subscriptions.push(
    vscode.commands.registerCommand('metal.showWGSL', async (uri?: vscode.Uri) => {
      if (!client) {
        vscode.window.showErrorMessage('Metal language server not ready yet.');
        return;
      }

      // Resolve the target .metal document. Three entry paths:
      //   • Editor title bar / context menu / keybinding → use active editor
      //   • Explorer right-click → VSCode passes the file Uri as first arg
      //   • Command palette → active editor must be a .metal buffer
      // For the explorer case the buffer may not be loaded yet; open it so
      // the LSP server has it in its documents collection and so the user
      // can see which file the preview corresponds to.
      let targetDoc: vscode.TextDocument | undefined;
      if (uri) {
        targetDoc = await vscode.workspace.openTextDocument(uri);
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'metal') {
          targetDoc = editor.document;
        }
      }
      if (!targetDoc) {
        vscode.window.showInformationMessage('Open a .metal file first.');
        return;
      }

      const response = await client.sendRequest<{
        ok: boolean;
        wgsl: string;
        error: string;
      }>('metal/transpile', { uri: targetDoc.uri.toString() });

      const body = response.ok
        ? response.wgsl
        : `// transpile failed:\n// ${response.error}\n`;

      const previewDoc = await vscode.workspace.openTextDocument({
        language: 'wgsl',
        content:  body,
      });
      await vscode.window.showTextDocument(previewDoc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview:    true,
      });
    }),
    vscode.commands.registerCommand('metal.showPreview', async (uri?: vscode.Uri) => {
      if (!client) {
        vscode.window.showErrorMessage('Metal language server not ready yet.');
        return;
      }
      let targetUri: vscode.Uri | undefined = uri;
      if (!targetUri) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'metal') {
          targetUri = editor.document.uri;
        }
      }
      if (!targetUri) {
        vscode.window.showInformationMessage('Open a .metal file first.');
        return;
      }
      await PreviewPanel.show(context, targetUri, client);
    }),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
