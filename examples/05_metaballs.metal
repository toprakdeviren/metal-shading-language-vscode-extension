// 05_metaballs.metal
// ──────────────────────────────────────────────────────────────────────────────
// Four animated metaballs blended with an implicit field. The mouse becomes
// a fifth ball while it's over the canvas. Threshold + smoothstep gives the
// blobby silhouette; a second, tighter threshold draws the iso-contour.
// ──────────────────────────────────────────────────────────────────────────────

#include <metal_stdlib>
using namespace metal;

struct Uniforms {
    float  time;
    float2 resolution;
    float2 mouse;
    uint   frame;
};

static float ballField(float2 p, float2 c, float r) {
    float2 d = p - c;
    return (r * r) / (dot(d, d) + 0.0001);
}

fragment float4 fs_main(float4 pos [[position]],
                        constant Uniforms& u [[buffer(0)]]) {
    float2 uv = (pos.xy * 2.0 - u.resolution) / u.resolution.y;
    float  t  = u.time;

    // Four orbiting balls in different phases.
    float2 b0 = float2(cos(t * 1.1) * 0.6,  sin(t * 1.3) * 0.5);
    float2 b1 = float2(cos(t * 0.7 + 1.0) * 0.8, sin(t * 0.9 + 0.5) * 0.4);
    float2 b2 = float2(sin(t * 1.5) * 0.5, cos(t * 0.6) * 0.7);
    float2 b3 = float2(sin(t * 0.4 + 2.0) * 0.9, cos(t * 1.1 + 1.5) * 0.3);

    float field = 0.0;
    field += ballField(uv, b0, 0.22);
    field += ballField(uv, b1, 0.18);
    field += ballField(uv, b2, 0.20);
    field += ballField(uv, b3, 0.16);

    // Mouse becomes a fifth, larger ball when on-screen.
    if (u.mouse.x >= 0.0) {
        float2 m = (u.mouse * 2.0 - u.resolution) / u.resolution.y;
        m.y = -m.y;
        field += ballField(uv, m, 0.30);
    }

    // Soft threshold for the blob mass, tighter one for the bright rim.
    float blob = smoothstep(1.0, 1.2, field);
    float rim  = smoothstep(1.3, 1.35, field) - smoothstep(1.35, 1.4, field);

    float3 colA = float3(0.2, 0.5, 1.0);
    float3 colB = float3(1.0, 0.3, 0.6);
    float3 base = mix(colA, colB, uv.y * 0.5 + 0.5);
    float3 col  = base * blob + float3(1.0, 1.0, 1.0) * rim;
    return float4(col, 1.0);
}
