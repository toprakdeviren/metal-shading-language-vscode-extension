// 04_polar_tunnel.metal
// ──────────────────────────────────────────────────────────────────────────────
// Polar-coordinate tunnel: map the screen into `(radius, angle)`, animate the
// texture coordinate, and look up a striped palette. Demonstrates `atan2` +
// `fract` + procedural coloring.
// ──────────────────────────────────────────────────────────────────────────────

#include <metal_stdlib>
using namespace metal;

struct Uniforms {
    float  time;
    float2 resolution;
    float2 mouse;
    uint   frame;
};

fragment float4 fs_main(float4 pos [[position]],
                        constant Uniforms& u [[buffer(0)]]) {
    // Centered aspect-corrected coords in [-1, 1].
    float2 uv = (pos.xy * 2.0 - u.resolution) / u.resolution.y;

    // Polar transform.
    float  r  = length(uv);
    float  a  = atan2(uv.y, uv.x);

    // Texture coords along the tunnel: u = angle, v = reciprocal radius so
    // the far end compresses toward the horizon.
    float2 tex = float2(a / 3.14159, 0.4 / max(r, 0.01));

    // Animate inward: advance `v` with time.
    tex.y += u.time * 0.5;

    // Stripes via fract + smoothstep for anti-aliased edges.
    float stripes = step(0.5, fract(tex.x * 8.0 + tex.y * 2.0));
    float rings   = step(0.7, fract(tex.y));
    float pattern = stripes * 0.7 + rings * 0.3;

    // Fade to black at the center so the tunnel has depth.
    float fade = smoothstep(0.0, 0.4, r);

    float3 base = float3(
        0.5 + 0.5 * sin(tex.y * 2.0 + 0.0),
        0.5 + 0.5 * sin(tex.y * 2.0 + 2.0),
        0.5 + 0.5 * sin(tex.y * 2.0 + 4.0));
    float3 col = base * pattern * fade;
    return float4(col, 1.0);
}
