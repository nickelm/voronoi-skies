/**
 * Simple box blur shader for altitude-based depth-of-field effect
 * Uses inline GLSL strings per project conventions (no vite-plugin-glsl)
 */

export const BlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBlurAmount: { value: 0.0 },
    uResolution: { value: [1, 1] }
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBlurAmount;
    uniform vec2 uResolution;

    varying vec2 vUv;

    void main() {
      vec2 texelSize = 1.0 / uResolution;

      // Blur radius scales from 0 to 8 pixels based on blur amount
      float radius = uBlurAmount * 8.0;

      if (radius < 0.5) {
        // No blur - just sample the texture directly
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      // 9-tap box blur (3x3 grid)
      vec4 color = vec4(0.0);
      float total = 0.0;

      for (float x = -1.0; x <= 1.0; x += 1.0) {
        for (float y = -1.0; y <= 1.0; y += 1.0) {
          vec2 offset = vec2(x, y) * texelSize * radius;
          color += texture2D(tDiffuse, vUv + offset);
          total += 1.0;
        }
      }

      gl_FragColor = color / total;
    }
  `
};
