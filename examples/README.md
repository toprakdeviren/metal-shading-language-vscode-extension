# Metal Preview Examples

Drop-in fragment shaders you can open with the VSCode **Metal** extension
and run against the live WebGPU preview (`Cmd+K P` / title-bar pulse icon).

Each file is a complete, self-contained `.metal` translation unit that:

- Declares a standard `Uniforms` struct the preview host auto-populates with
  `time`, `resolution`, `mouse`, and `frame`.
- Takes `[[position]]` as a direct fragment parameter so no vertex shader
  or `stage_in` plumbing is required.
- Compiles through `libmsl` (MSL → WGSL) and into a WebGPU pipeline
  without external textures, buffers, or samplers.

| File | What it shows | Interactive? |
|---|---|---|
| [01_plasma.metal](01_plasma.metal)             | Classic overlapping sine plasma — smoke test for the preview | — |
| [02_raymarch_sphere.metal](02_raymarch_sphere.metal) | Ray-marched SDF sphere on a ground plane with orbiting camera and fog | Move the mouse to reposition the light |
| [03_mandelbrot.metal](03_mandelbrot.metal)     | Smooth-colored Mandelbrot set with auto zoom | Drag the mouse to pan the view |
| [04_polar_tunnel.metal](04_polar_tunnel.metal) | Polar-coordinate tunnel using `atan2` + stripes | — |
| [05_metaballs.metal](05_metaballs.metal)       | Four animated metaballs with a bright iso-contour rim | Move the mouse to add a fifth, larger ball |

## Running them

1. Install the extension from `editor/vscode-metal/metal-1.0.0.vsix`:
   ```bash
   code --install-extension editor/vscode-metal/metal-1.0.0.vsix --force
   ```
2. Reload the VSCode window (`Developer: Reload Window`).
3. Open any file in this directory.
4. Hit `Cmd+K P` (macOS) / `Ctrl+K P` (Linux/Windows) or click the pulse
   icon in the editor title bar.

The preview recompiles on every keystroke (debounced) and on save, so you
can edit and see the result update in real time.

## Scope

The preview host is intentionally minimal — it's a ShaderToy-style harness,
not a general Metal runtime. The following work out of the box:

- Fragment entry point taking `[[position]]` or nothing
- `Uniforms` buffer at `[[buffer(0)]]`
- Any pure-math body: trig, `length`, `dot`, `normalize`, `mix`, `smoothstep`,
  loops, user-defined helper functions

The following **do not** work yet (the overlay will tell you):

- `stage_in` structs (would need a matching vertex stage)
- Textures and samplers
- Storage buffers
- Compute kernels (they have no visual output; use `Show Transpiled WGSL`
  instead to inspect them)

Contributions welcome: any fragment shader that fits the scope above and
teaches something new about Metal / WGSL is a good candidate for this
directory.
