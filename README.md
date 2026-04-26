# Metal Shading Language for VSCode

A Visual Studio Code extension and Language Server that gives real
first-class support to Apple's Metal Shading Language (`.metal` / `.msl`).

- **Semantic highlighting** driven by a real Metal lexer — types,
  keywords, struct names, function names, parameters, fields, local
  variables and MSL built-in functions each light up distinctly,
  classified by the same front-end the transpiler uses.
- **Structured diagnostics** in the Problems panel as you type, with
  precise line/column ranges and one squiggle per malformed construct
  (no cascades).
- **`Metal: Show Transpiled WGSL`** — a side-panel view of the WebGPU
  shader your `.metal` file lowers to. Handy when you want to know
  what the browser actually sees.
- **`Metal: Open Live Shader Preview`** (experimental) — a
  ShaderToy-style webview that renders your fragment shader against a
  canvas with WebGPU and rebuilds on every keystroke. See
  [`examples/`](examples/) for drop-in fragment shaders that run in it.

Two packages live in this monorepo:

| Package | Role |
|---|---|
| [`metal-lsp/`](metal-lsp/)       | Node-hosted LSP server. Loads `libmsl` (below) as WebAssembly and answers semantic-tokens, diagnostics, and a custom `metal/transpile` request. |
| [`vscode-metal/`](vscode-metal/) | VSCode extension shell. LSP client, TextMate fallback grammar, preview webview, commands and keybindings. |

## About the WebAssembly binary

The language server doesn't parse MSL in TypeScript — it ships a
precompiled WebAssembly build of **`libmsl`**, a C compiler front-end
that produces the WGSL output and feeds the editor's semantic-tokens
and diagnostic streams. You'll find it at
[`metal-lsp/wasm/msl_compiler.{js,wasm}`](metal-lsp/wasm) and it is
**committed to this repo** — clone + build works offline, no download
step, no native toolchain required.

### Where does the C source live?

In its own public repository:
**<https://github.com/toprakdeviren/metal-to-wgsl>**

A standalone C library — MSL → WGSL transpiler plus a token stream
API for editors and structured LSP-compatible diagnostics. Both this
extension and any other tool can link against it. The WASM binary in
this repo is built from that source and committed alongside the
extension so the editor experience works without an emscripten
toolchain. Every update to the binary lands in this repo's git
history, so you can audit when the compiler behavior changed.

If you hit a bug that looks like it comes from the compiler — a parse
error on valid MSL, wrong WGSL output, a preview pipeline rejection —
file it against either repository; I triage both. The extension
tracker:
<https://github.com/toprakdeviren/metal-shading-language-vscode-extension/issues>

## Installation (end users)

Grab the latest `.vsix` from the Releases page (or build one yourself,
see below) and install it:

```bash
code --install-extension metal-1.0.0.vsix
```

Then reload the window. Open any `.metal` / `.msl` file and:

| | |
|---|---|
| `Cmd+K V` / `Ctrl+K V` | Show the transpiled WGSL in a side panel |
| `Cmd+K P` / `Ctrl+K P` | Open the live WebGPU preview (fragment shaders) |

Both commands also live in the editor title bar (pulse / open-preview
icons), the editor right-click menu, and the explorer right-click menu.

## Building from source

Requires Node 18+ and npm 9+ (for workspaces).

```bash
git clone https://github.com/toprakdeviren/metal-shading-language-vscode-extension
cd metal-shading-language-vscode-extension
npm install
npm run package    # produces vscode-metal/metal-1.0.0.vsix
```

Development loop:

```bash
npm run watch      # tsc --watch in both packages
# then F5 in VSCode with vscode-metal/ open → Extension Development Host
```

No C compiler, no emscripten, no native toolchain needed — the WASM
binary is already in the tree.

## Scope and known limitations

The language server's semantic highlighting and diagnostics are
designed to handle the full MSL 3.2 surface; gaps in that surface are
compiler bugs and I treat them as such. The WGSL preview and the live
WebGPU preview are built on top of a transpiler that is still closing
gaps, so:

- If a shader looks right in the editor but the Problems panel reports
  something you think is valid MSL → parser gap, please report it.
- If the transpiled WGSL compiles in the browser but runs wrong →
  lowering/emission bug, please report it.
- If the live preview overlay says "pipeline failed to compile", copy
  the WGSL error text and the MSL snippet into the bug report.

The live preview's scope is intentionally small for v0.1:

- Fragment entry point takes `@builtin(position)` or nothing
- Optional uniform buffer at `@group(0) @binding(0)` matching
  `struct Uniforms { time: f32, resolution: vec2f, mouse: vec2f, frame: u32 }`
- No textures, no `stage_in` structs, no compute kernels

That scope will grow as the underlying compiler stabilizes.

## License

MIT. See [`LICENSE`](LICENSE).
