// 01_plasma.metal
// ──────────────────────────────────────────────────────────────────────────────
// Classic sine-wave plasma. Overlapping trig fields hashed into three color
// channels. No branching, no noise, no math tricks — good baseline for
// verifying the Metal Preview pipeline.
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
    float2 uv = pos.xy / u.resolution;
    float  t  = u.time;

    float v = 0.0;
    v += sin((uv.x + t) * 10.0);
    v += sin((uv.y + t) * 10.0);
    v += sin((uv.x + uv.y + t) * 10.0);
    v += sin(sqrt(uv.x * uv.x + uv.y * uv.y + 1.0) * 20.0 + t);
    v *= 0.25;

    float3 col = float3(
        0.5 + 0.5 * sin(v * 3.14159 + 0.0),
        0.5 + 0.5 * sin(v * 3.14159 + 2.094),
        0.5 + 0.5 * sin(v * 3.14159 + 4.188)
    );
    return float4(col, 1.0);
}
