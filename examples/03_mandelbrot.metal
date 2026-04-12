// 03_mandelbrot.metal
// ──────────────────────────────────────────────────────────────────────────────
// Mandelbrot set with a smooth coloring term. The view pans slowly over time;
// drag the mouse to pull the frame in that direction. Good showcase for
// iteration-heavy compute inside a fragment shader.
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
    // Centered, aspect-corrected coordinates in [-1.5, 1.5] horizontally.
    float2 uv = (pos.xy * 2.0 - u.resolution) / u.resolution.y;

    // Slow automatic pan + mouse-driven offset.
    float2 mouseN = u.mouse.x < 0.0 ? float2(0.5, 0.5) : u.mouse / u.resolution;
    float  zoom   = 1.2 + 0.6 * sin(u.time * 0.3);
    float2 center = float2(-0.75 + (mouseN.x - 0.5) * 0.8,
                            0.00 + (mouseN.y - 0.5) * 0.8);
    float2 c = center + uv / zoom;

    // Mandelbrot iteration.
    float2 z = float2(0.0, 0.0);
    float  iter = 0.0;
    const float maxIter = 120.0;
    for (int i = 0; i < 120; ++i) {
        z = float2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 256.0) break;
        iter += 1.0;
    }

    // Smooth escape-time value for continuous color gradients.
    float m = iter;
    if (iter < maxIter) {
        float log_zn = log(dot(z, z)) * 0.5;
        float nu     = log(log_zn / log(2.0)) / log(2.0);
        m = iter + 1.0 - nu;
    }
    float t = m / maxIter;

    // Palette: black interior, warm-to-cool gradient outside.
    float3 col = (iter >= maxIter)
        ? float3(0.0, 0.0, 0.0)
        : float3(
            0.5 + 0.5 * cos(6.28318 * (t + 0.00)),
            0.5 + 0.5 * cos(6.28318 * (t + 0.33)),
            0.5 + 0.5 * cos(6.28318 * (t + 0.66)));
    return float4(col, 1.0);
}
