// 02_raymarch_sphere.metal
// ──────────────────────────────────────────────────────────────────────────────
// Minimal distance-field ray marcher: a sphere sitting on a ground plane, lit
// by one directional light, with a soft horizon fog. Scene rotates with time.
// Drag the mouse to reposition the light. Good stress test for loops + vector
// math in the transpiler.
// ──────────────────────────────────────────────────────────────────────────────

#include <metal_stdlib>
using namespace metal;

struct Uniforms {
    float  time;
    float2 resolution;
    float2 mouse;
    uint   frame;
};

// Signed distance to a sphere at the origin with radius r.
static float sdSphere(float3 p, float r) {
    return length(p) - r;
}

// Scene SDF: sphere floating above y = -0.5 plane.
static float sceneSDF(float3 p) {
    float sphere = sdSphere(p - float3(0.0, 0.1, 0.0), 0.6);
    float plane  = p.y + 0.5;
    return min(sphere, plane);
}

// Central-difference normal estimate.
static float3 sceneNormal(float3 p) {
    float2 e = float2(0.001, 0.0);
    return normalize(float3(
        sceneSDF(p + float3(e.x, e.y, e.y)) - sceneSDF(p - float3(e.x, e.y, e.y)),
        sceneSDF(p + float3(e.y, e.x, e.y)) - sceneSDF(p - float3(e.y, e.x, e.y)),
        sceneSDF(p + float3(e.y, e.y, e.x)) - sceneSDF(p - float3(e.y, e.y, e.x))
    ));
}

fragment float4 fs_main(float4 pos [[position]],
                        constant Uniforms& u [[buffer(0)]]) {
    // Normalized coords centered on screen, y-up, aspect-corrected.
    float2 uv = (pos.xy * 2.0 - u.resolution) / u.resolution.y;
    uv.y = -uv.y;

    // Orbit camera around the origin.
    float  angle = u.time * 0.4;
    float3 ro = float3(sin(angle) * 3.0, 1.2, cos(angle) * 3.0);
    float3 forward = normalize(-ro);
    float3 right   = normalize(cross(float3(0.0, 1.0, 0.0), forward));
    float3 up      = cross(forward, right);
    float3 rd = normalize(forward + right * uv.x + up * uv.y);

    // Ray march.
    float t = 0.0;
    float hit = 0.0;
    for (int i = 0; i < 80; ++i) {
        float3 p = ro + rd * t;
        float  d = sceneSDF(p);
        if (d < 0.001) { hit = 1.0; break; }
        if (t > 20.0)  { break; }
        t += d;
    }

    // Light position follows the mouse. When the mouse is outside the canvas
    // (-1,-1) we park the light overhead.
    float2 mouseN = u.mouse.x < 0.0 ? float2(0.3, 0.7) : u.mouse / u.resolution;
    float3 lightPos = float3((mouseN.x - 0.5) * 4.0, 1.5, (mouseN.y - 0.5) * 4.0 + 1.0);

    float3 col = float3(0.05, 0.08, 0.12);  // sky
    if (hit > 0.5) {
        float3 p = ro + rd * t;
        float3 n = sceneNormal(p);
        float3 l = normalize(lightPos - p);
        float  diff = max(dot(n, l), 0.0);
        float  amb  = 0.15;
        float3 base = (p.y < -0.49) ? float3(0.3, 0.3, 0.35)   // ground
                                    : float3(0.9, 0.5, 0.3);   // sphere
        col = base * (amb + diff);
        // Exponential fog.
        col = mix(col, float3(0.05, 0.08, 0.12), 1.0 - exp(-t * 0.08));
    }

    return float4(col, 1.0);
}
