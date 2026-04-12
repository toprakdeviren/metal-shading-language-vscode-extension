// preview.ts — WebGPU "ShaderToy" live preview for Metal shaders.
// ──────────────────────────────────────────────────────────────────────────────
// Opens a VSCode webview next to the editor, transpiles the active .metal
// file to WGSL via the LSP `metal/transpile` request, and runs it inside the
// webview against a canvas with WebGPU. A fullscreen triangle vertex shader
// is injected automatically, and a small uniform buffer
//
//     struct Uniforms {
//       time:       f32,     //  0  seconds since preview started
//       _pad0:      f32,
//       resolution: vec2f,   //  8  canvas size in CSS pixels
//       mouse:      vec2f,   // 16  pointer position, (-1,-1) when outside
//       frame:      u32,     // 24  frame counter
//     }
//
// is bound at @group(0) @binding(0) when the shader declares one. Anything
// more exotic than that — textures, stage_in varyings, custom bind groups —
// is reported as an unsupported-preview message in an overlay instead of
// crashing the pipeline.
// ──────────────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

interface TranspileResponse {
  ok:    boolean;
  wgsl:  string;
  error: string;
}

export class PreviewPanel {
  private static current: PreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private targetUri: vscode.Uri;
  private refreshTimer: NodeJS.Timeout | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    targetUri: vscode.Uri,
    private readonly client: LanguageClient,
  ) {
    this.panel      = panel;
    this.targetUri  = targetUri;
    this.panel.webview.html = buildHtml();

    // Tear-down on close.
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Live refresh: debounced on every text change to our target, immediate
    // on save. Debounce so we don't thrash the GPU pipeline on every keystroke.
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== this.targetUri.toString()) return;
        this.scheduleRefresh(150);
      }),
      vscode.workspace.onDidSaveTextDocument((d) => {
        if (d.uri.toString() !== this.targetUri.toString()) return;
        this.scheduleRefresh(0);
      }),
    );

    // First render.
    void this.refresh();
  }

  /** Open (or focus) the single preview panel on behalf of @p uri. */
  static async show(
    _context: vscode.ExtensionContext,
    uri: vscode.Uri,
    client: LanguageClient,
  ): Promise<void> {
    if (PreviewPanel.current) {
      PreviewPanel.current.targetUri = uri;
      PreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
      await PreviewPanel.current.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'metalPreview',
      'Metal Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );

    PreviewPanel.current = new PreviewPanel(panel, uri, client);
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, delayMs);
  }

  private async refresh(): Promise<void> {
    // The LSP `metal/transpile` request needs the document loaded in the
    // server's document collection; openTextDocument ensures that.
    const doc = await vscode.workspace.openTextDocument(this.targetUri);

    let response: TranspileResponse;
    try {
      response = await this.client.sendRequest<TranspileResponse>(
        'metal/transpile',
        { uri: doc.uri.toString() },
      );
    } catch (err) {
      this.panel.webview.postMessage({
        type:    'error',
        message: `LSP request failed: ${String(err)}`,
      });
      return;
    }

    if (response.ok) {
      this.panel.webview.postMessage({ type: 'wgsl', wgsl: response.wgsl });
    } else {
      this.panel.webview.postMessage({
        type:    'error',
        message: response.error || 'transpile failed',
      });
    }
  }

  private dispose(): void {
    PreviewPanel.current = undefined;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

// ── Webview HTML ────────────────────────────────────────────────────────────
// Inlined so the bundled extension ships one file. Uses a CSP nonce so the
// inline script survives VSCode's default webview content-security policy.

function buildHtml(): string {
  const nonce = randomNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #1e1e1e; color: #ddd; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
    #stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    canvas { max-width: 100%; max-height: 100%; aspect-ratio: 1 / 1; background: #000; display: block; }
    #overlay {
      position: absolute; inset: 0;
      padding: 12px 16px;
      font: 12px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      white-space: pre-wrap;
      background: rgba(30, 30, 30, 0.92);
      color: #f48771;
      overflow: auto;
      display: none;
    }
    #overlay.visible { display: block; }
    #overlay .title { color: #ddd; font-weight: 600; margin-bottom: 8px; }
    #status {
      position: absolute; left: 8px; bottom: 8px;
      font: 11px ui-monospace, Menlo, monospace;
      color: #7a7a7a;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="stage"><canvas id="c" width="512" height="512"></canvas></div>
  <div id="overlay"></div>
  <div id="status">initializing…</div>
  <script nonce="${nonce}">
${WEBVIEW_RUNTIME_JS}
  </script>
</body>
</html>`;
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// ── Webview JavaScript (runs inside the iframe) ─────────────────────────────
// Kept as a plain string so the CSP nonce wraps it and there's no second
// asset to bundle. Communicates with the extension via postMessage.

const WEBVIEW_RUNTIME_JS = String.raw`
(() => {
  const canvas  = document.getElementById('c');
  const overlay = document.getElementById('overlay');
  const status  = document.getElementById('status');
  const vscode  = acquireVsCodeApi ? acquireVsCodeApi() : null;

  function setStatus(text) { status.textContent = text; }
  function showError(title, body) {
    overlay.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = title;
    const b = document.createElement('div');
    b.textContent = body;
    overlay.appendChild(t);
    overlay.appendChild(b);
    overlay.classList.add('visible');
  }
  function clearError() { overlay.classList.remove('visible'); }

  // Injected vertex shader: fullscreen triangle in NDC. Unique name so it
  // can't collide with whatever entry points the user authored.
  const VS_NAME = 'ms_preview_fullscreen_vs';
  const VS_SOURCE = [
    '@vertex',
    'fn ' + VS_NAME + '(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4f {',
    '  var pos = array<vec2f, 3>(',
    '    vec2f(-1.0, -1.0),',
    '    vec2f( 3.0, -1.0),',
    '    vec2f(-1.0,  3.0),',
    '  );',
    '  return vec4f(pos[vid], 0.0, 1.0);',
    '}',
  ].join('\n');

  let device, ctx, format, pipeline, bindGroup, uniformBuf;
  let startTime = performance.now();
  let frame = 0;
  let mouseX = -1, mouseY = -1;
  let rafId = 0;
  let currentWgsl = '';

  async function initDevice() {
    if (device) return true;
    if (!navigator.gpu) {
      showError('WebGPU unavailable', 'This VSCode build does not expose navigator.gpu. Update to 1.83+ and make sure "enable-unsafe-webgpu" is not disabled.');
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) { showError('No GPU adapter', 'navigator.gpu.requestAdapter() returned null.'); return false; }
      device = await adapter.requestDevice();
      device.lost.then((info) => {
        showError('GPU device lost', info.message || '(no reason)');
        device = null; pipeline = null;
      });

      ctx = canvas.getContext('webgpu');
      format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: 'opaque' });

      uniformBuf = device.createBuffer({
        size: 32,                     // time + pad + resolution(2) + mouse(2) + frame + pad  = 32B
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      return true;
    } catch (err) {
      showError('GPU init failed', String(err && err.message ? err.message : err));
      return false;
    }
  }

  function extractFragmentEntry(wgsl) {
    const m = wgsl.match(/@fragment\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/);
    return m ? m[1] : null;
  }

  async function rebuild(wgsl) {
    currentWgsl = wgsl;
    if (!await initDevice()) return;

    const fsName = extractFragmentEntry(wgsl);
    if (!fsName) {
      showError('No fragment entry point',
        'Preview requires a @fragment function. The transpiled WGSL had none — did you write a compute kernel or a vertex-only shader?');
      pipeline = null;
      return;
    }

    // Append our injected vertex shader to the user's module. If the user's
    // source already had a vertex entry it stays in the module (unused);
    // WebGPU is fine with extra, unreachable entry points.
    const combined = wgsl + '\n\n' + VS_SOURCE + '\n';

    // Capture compile errors synchronously so we can surface them cleanly.
    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: combined });

    let newPipeline, pipelineErr;
    try {
      newPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex:   { module, entryPoint: VS_NAME },
        fragment: { module, entryPoint: fsName, targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
    } catch (err) {
      pipelineErr = err;
    }

    const err = await device.popErrorScope();
    if (pipelineErr || err) {
      const msg = (pipelineErr && pipelineErr.message) ? pipelineErr.message
                 : (err && err.message) ? err.message
                 : 'unknown pipeline validation error';
      showError('Pipeline failed to compile', msg);
      pipeline = null;
      return;
    }

    // Best-effort: if the shader uses @group(0) @binding(0), bind our uniform
    // buffer there. layout:'auto' only exposes bind-group entries the shader
    // actually declares; attempting to create a group with no matching entry
    // would throw, so guard the call.
    bindGroup = null;
    try {
      const layout = newPipeline.getBindGroupLayout(0);
      bindGroup = device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
      });
    } catch (_noUniform) {
      // Shader doesn't declare any bind group — that's fine, we just skip.
    }

    pipeline = newPipeline;
    clearError();
    frame = 0;
    startTime = performance.now();
    if (!rafId) rafId = requestAnimationFrame(renderLoop);
    setStatus('running · fragment: ' + fsName);
  }

  function renderLoop() {
    rafId = 0;
    if (!pipeline || !device) return;

    // Match canvas backing store to CSS size for crisp output.
    const rect = canvas.getBoundingClientRect();
    const dpr  = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width  * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }

    const t = (performance.now() - startTime) / 1000;
    const u = new ArrayBuffer(32);
    const f32 = new Float32Array(u);
    const u32 = new Uint32Array(u);
    f32[0] = t;              // time
    // f32[1] padding
    f32[2] = canvas.width;   // resolution.x
    f32[3] = canvas.height;  // resolution.y
    f32[4] = mouseX;         // mouse.x
    f32[5] = mouseY;         // mouse.y
    u32[6] = frame;          // frame
    // u32[7] padding
    device.queue.writeBuffer(uniformBuf, 0, u);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp:  'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    if (bindGroup) pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
    device.queue.submit([enc.finish()]);

    frame++;
    rafId = requestAnimationFrame(renderLoop);
  }

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (canvas.width  / r.width);
    mouseY = (e.clientY - r.top)  * (canvas.height / r.height);
  });
  canvas.addEventListener('mouseleave', () => { mouseX = -1; mouseY = -1; });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'wgsl') {
      void rebuild(msg.wgsl);
    } else if (msg.type === 'error') {
      showError('Transpile failed', msg.message || '(no message)');
      pipeline = null;
    }
  });

  setStatus('waiting for shader…');
})();
`;
