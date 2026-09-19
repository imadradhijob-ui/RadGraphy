import { Volume3D } from './mprEngine';
import { Volume3dPreset } from './volumeRaycaster';

export interface WebglRenderOptions {
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  panX: number;
  panY: number;
  preset: Volume3dPreset;
  thresholdMin: number;
  thresholdMax: number;
  clipPlaneZ: number;
  enableAmbientOcclusion: boolean;
  specularPower?: number;
  specularIntensity?: number;
  quality: 'fast' | 'high' | 'ultra';
}

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler3D u_volume;
uniform vec3 u_volumeDim;
uniform vec3 u_boxSize; // Physical aspect ratio scaled [0..1]

uniform mat3 u_rotMatrix;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec2 u_resolution;

uniform float u_thresholdMin;
uniform float u_thresholdMax;
uniform float u_huMin;
uniform float u_huMax;
uniform float u_clipPlaneZ;

uniform int u_presetId; // 0: bone, 1: angio, 2: skin, 3: dental, 4: mip3d, 5: cinematic_bone
uniform vec3 u_baseColor;
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specularPower;
uniform float u_specularIntensity;
uniform float u_opacityMultiplier;
uniform bool u_enableAO;
uniform int u_maxSteps;
uniform float u_stepSize;

// Ray - Box Intersection (AABB) with zero-division protection
bool intersectBox(vec3 rayOrig, vec3 rayDir, vec3 boxMin, vec3 boxMax, out float tNear, out float tFar) {
  vec3 safeDir = vec3(
    abs(rayDir.x) < 1e-5 ? (rayDir.x >= 0.0 ? 1e-5 : -1e-5) : rayDir.x,
    abs(rayDir.y) < 1e-5 ? (rayDir.y >= 0.0 ? 1e-5 : -1e-5) : rayDir.y,
    abs(rayDir.z) < 1e-5 ? (rayDir.z >= 0.0 ? 1e-5 : -1e-5) : rayDir.z
  );
  vec3 invDir = 1.0 / safeDir;
  vec3 t0 = (boxMin - rayOrig) * invDir;
  vec3 t1 = (boxMax - rayOrig) * invDir;
  vec3 tMin = min(t0, t1);
  vec3 tMax = max(t0, t1);
  tNear = max(max(tMin.x, tMin.y), tMin.z);
  tFar = min(min(tMax.x, tMax.y), tMax.z);
  return tFar > max(tNear, 0.0);
}

// Gradient normal estimation via finite differences
vec3 estimateNormal(vec3 texCoord) {
  vec3 delta = 1.0 / u_volumeDim;
  float dx = texture(u_volume, texCoord + vec3(delta.x, 0.0, 0.0)).r - texture(u_volume, texCoord - vec3(delta.x, 0.0, 0.0)).r;
  float dy = texture(u_volume, texCoord + vec3(0.0, delta.y, 0.0)).r - texture(u_volume, texCoord - vec3(0.0, delta.y, 0.0)).r;
  float dz = texture(u_volume, texCoord + vec3(0.0, 0.0, delta.z)).r - texture(u_volume, texCoord - vec3(0.0, 0.0, delta.z)).r;
  vec3 n = vec3(dx, dy, dz);
  float len = length(n);
  return len > 1e-4 ? n / len : vec3(0.0, 0.0, 1.0);
}

void main() {
  // Screen & viewport setup: Volume box (unit 1.0) fills ~82% of viewport height by default
  float minDim = min(u_resolution.x, u_resolution.y);
  vec2 pixelPos = (v_uv - 0.5) * u_resolution;
  vec2 pannedPixel = pixelPos - u_pan;
  
  float viewScale = (minDim * 0.82) * u_zoom;
  vec2 camXY = pannedPixel / viewScale;
  
  // Camera Ray Setup (Camera Space: +X Right, +Y Up, +Z Forward into screen)
  vec3 rayOriginCam = vec3(camXY.x, camXY.y, -2.5);
  vec3 rayDirCam = vec3(0.0, 0.0, 1.0);

  // Rotate camera rays into volume coordinate frame using canonical orientation matrix
  vec3 rayOrigin = u_rotMatrix * rayOriginCam;
  vec3 rayDir = normalize(u_rotMatrix * rayDirCam);

  vec3 boxMin = -u_boxSize * 0.5;
  vec3 boxMax = u_boxSize * 0.5;

  // Apply Clipping Plane on Z
  boxMax.z = mix(boxMin.z, boxMax.z, u_clipPlaneZ);

  float tNear, tFar;
  if (!intersectBox(rayOrigin, rayDir, boxMin, boxMax, tNear, tFar)) {
    // Subtle medical background gradient vignette
    float r = length(v_uv - 0.5);
    vec3 bg = mix(vec3(0.05, 0.07, 0.10), vec3(0.01, 0.01, 0.02), r * 1.4);
    fragColor = vec4(bg, 1.0);
    return;
  }

  // Raymarching variables
  vec3 p = rayOrigin + rayDir * tNear;
  float t = tNear;
  float dt = u_stepSize;

  vec4 accum = vec4(0.0);
  float maxMipVal = 0.0;

  // Studio Lighting Directions (Fixed in camera space, transformed to volume space)
  vec3 keyLight = normalize(u_rotMatrix * vec3(0.55, 0.65, -0.52));
  vec3 fillLight = normalize(u_rotMatrix * vec3(-0.60, -0.30, -0.73));
  vec3 rimLight = normalize(u_rotMatrix * vec3(0.00, 0.80, 0.60));

  float huRange = max(1.0, u_huMax - u_huMin);
  float tfRange = max(1.0, u_thresholdMax - u_thresholdMin);

  for (int i = 0; i < u_maxSteps; ++i) {
    if (t > tFar || accum.a >= 0.98) break;

    // Convert world position p into 3D texture coordinate [0..1]
    vec3 texCoord = (p + u_boxSize * 0.5) / u_boxSize;

    if (all(greaterThanEqual(texCoord, vec3(0.0))) && all(lessThanEqual(texCoord, vec3(1.0)))) {
      float normVal = texture(u_volume, texCoord).r;
      float hu = normVal * huRange + u_huMin;

      if (u_presetId == 4) { // MIP Mode
        if (normVal > maxMipVal) maxMipVal = normVal;
      } else if (hu >= u_thresholdMin) {
        // Smoothstep S-Curve Opacity
        float tRaw = clamp((hu - u_thresholdMin) / tfRange, 0.0, 1.0);
        float sCurve = tRaw * tRaw * (3.0 - 2.0 * tRaw);
        float alphaSample = sCurve * u_opacityMultiplier * dt * 80.0;
        alphaSample = clamp(alphaSample, 0.0, 1.0);

        if (alphaSample > 0.01) {
          // Outward-facing surface normal (density decreases from bone to air)
          vec3 N = -estimateNormal(texCoord);
          vec3 V = -rayDir;
          // Ensure normal faces the viewer
          if (dot(N, V) < 0.0) {
            N = -N;
          }

          // Studio 3-point diffuse
          float nDotKey = max(0.0, dot(N, keyLight));
          float nDotFill = max(0.0, dot(N, fillLight));
          float nDotRim = max(0.0, dot(N, rimLight));
          float diffuseLight = u_ambient + u_diffuse * (nDotKey * 0.80 + nDotFill * 0.30 + nDotRim * 0.25);

          // Blinn-Phong Glossy Specular Highlight (convex exterior sheen)
          vec3 H = normalize(keyLight + V);
          float nDotH = max(0.0, dot(N, H));
          float specular = pow(nDotH, u_specularPower) * u_specularIntensity;

          // Ambient Occlusion cavity darkening
          float ao = 1.0;
          if (u_enableAO) {
            vec3 aoCoord = texCoord + N * (3.5 / u_volumeDim);
            if (all(greaterThanEqual(aoCoord, vec3(0.0))) && all(lessThanEqual(aoCoord, vec3(1.0)))) {
              float aoVal = texture(u_volume, aoCoord).r * huRange + u_huMin;
              if (aoVal > u_thresholdMin) {
                ao = 0.72; // Deep cavity shadow inside eye orbits & sutures
              }
            }
          }

          // Preset Color Assignment
          vec3 sampleColor = u_baseColor;
          if (u_presetId == 5 || u_presetId == 0) {
            // Cinematic Ivory Bone with subtle warm pinkish undertones for deeper trabeculae
            vec3 ivoryPorcelain = vec3(0.96, 0.93, 0.90);
            vec3 deepTrabecular = vec3(0.88, 0.75, 0.70);
            sampleColor = mix(deepTrabecular, ivoryPorcelain, clamp((hu - u_thresholdMin) / 600.0, 0.0, 1.0));
          } else if (u_presetId == 1) {
            // Angiography: Red blood vessels & soft ivory bone
            if (hu > 240.0) {
              sampleColor = vec3(0.92, 0.88, 0.82); // Bone
              alphaSample *= 0.45;
            } else {
              sampleColor = vec3(0.96, 0.18, 0.22); // Arterial blood
            }
          } else if (u_presetId == 2) {
            // Skin & Soft Tissue: Warm peach / skin tones
            sampleColor = vec3(0.88, 0.68, 0.58);
          } else if (u_presetId == 3) {
            // Dental: Ultra-bright pearlescent enamel
            sampleColor = vec3(0.98, 0.96, 0.92);
          } else if (u_presetId == 6) {
            // Brain Soft Tissue / Neuro Parenchyma: Natural soft cerebral tissue
            sampleColor = vec3(0.92, 0.77, 0.71);
          }

          // Final Lit Color for sample
          vec3 litColor = (sampleColor * diffuseLight * ao) + vec3(specular);

          // Front-to-back accumulation
          accum.rgb += (1.0 - accum.a) * alphaSample * litColor;
          accum.a += (1.0 - accum.a) * alphaSample;
        }
      }
    }

    t += dt;
    p += rayDir * dt;
  }

  if (u_presetId == 4) { // MIP
    vec3 mipColor = u_baseColor * (maxMipVal * 1.2);
    fragColor = vec4(mipColor, 1.0);
    return;
  }

  // Composite over vignette background
  float r = length(v_uv - 0.5);
  vec3 bg = mix(vec3(0.05, 0.07, 0.10), vec3(0.01, 0.01, 0.02), r * 1.4);
  vec3 finalColor = accum.rgb + bg * (1.0 - accum.a);

  fragColor = vec4(finalColor, 1.0);
}
`;

export class WebglVolumeRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private volumeTexture: WebGLTexture | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private currentVolume: Volume3D | null = null;

  // Uniform locations cache
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(public canvas: HTMLCanvasElement) {
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    this.initGL();
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    console.warn('[3D GPU] WebGL context lost - safely intercepted to prevent crash.');
    this.gl = null;
    this.program = null;
    this.volumeTexture = null;
    this.quadVao = null;
  };

  private onContextRestored = () => {
    console.info('[3D GPU] WebGL context restored - re-initializing 3D pipeline.');
    this.initGL();
    if (this.currentVolume) {
      this.uploadVolume(this.currentVolume);
    }
  };

  public isSupported(): boolean {
    return this.gl !== null && this.program !== null;
  }

  private initGL() {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });

      if (!gl) {
        console.warn('[3D GPU] WebGL2 not supported on this hardware.');
        return;
      }

      this.gl = gl;

      // Compile Shaders
      const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fragShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);

      if (!vertShader || !fragShader) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[3D GPU] Shader link error:', gl.getProgramInfoLog(program));
        return;
      }

      this.program = program;
      gl.useProgram(program);

      // Create Fullscreen Quad VAO
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      const quadVerts = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.quadVao = vao;

      // Cache Uniform Locations
      const uniformNames = [
        'u_volume', 'u_volumeDim', 'u_boxSize', 'u_rotMatrix', 'u_pan', 'u_zoom',
        'u_resolution', 'u_thresholdMin', 'u_thresholdMax', 'u_huMin', 'u_huMax',
        'u_clipPlaneZ', 'u_presetId', 'u_baseColor', 'u_ambient', 'u_diffuse',
        'u_specularPower', 'u_specularIntensity', 'u_opacityMultiplier', 'u_enableAO',
        'u_maxSteps', 'u_stepSize'
      ];

      for (const name of uniformNames) {
        this.uniforms[name] = gl.getUniformLocation(program, name);
      }

    } catch (e) {
      console.error('[3D GPU] Initialization failed:', e);
      this.gl = null;
    }
  }

  private compileShader(type: number, src: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, src);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('[3D GPU] Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Uploads the 3D Voxel dataset to the GPU as a native 3D Texture (TEXTURE_3D)
   */
  public uploadVolume(volume: Volume3D) {
    const gl = this.gl;
    if (!gl || !this.program) return;

    if (this.currentVolume === volume && this.volumeTexture) {
      return; // Already loaded on GPU
    }

    const { dimX, dimY, dimZ, data, minHu, maxHu } = volume;
    const totalVoxels = dimX * dimY * dimZ;

    // Normalize 16-bit HU / pixel data into 8-bit buffer for high-performance GPU sampling.
    // Handles any modality: CT (e.g. -1024..3071), MR (0..800), PET/NM, or raw 12-bit CT.
    const huMin = (minHu !== undefined && isFinite(minHu)) ? minHu : -1024;
    const huMax = (maxHu !== undefined && isFinite(maxHu) && maxHu > huMin) ? maxHu : (huMin + 2048);
    const huRange = Math.max(1, huMax - huMin);

    const normData = new Uint8Array(totalVoxels);
    for (let i = 0; i < totalVoxels; i++) {
      const hu = data[i];
      const n = Math.min(255, Math.max(0, Math.round(((hu - huMin) / huRange) * 255)));
      normData[i] = n;
    }

    if (this.volumeTexture) {
      gl.deleteTexture(this.volumeTexture);
    }

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, texture);

    // Trilinear filtering on GPU for silky-smooth surface gradients
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.R8,
      dimX,
      dimY,
      dimZ,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      normData
    );

    this.volumeTexture = texture;
    this.currentVolume = volume;
  }

  /**
   * Renders the 3D volume with active camera transforms, studio lights, and presets
   */
  public render(
    volume: Volume3D,
    width: number,
    height: number,
    options: WebglRenderOptions
  ) {
    const gl = this.gl;
    if (!gl || !this.program || !this.quadVao) return;

    this.uploadVolume(volume);

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.quadVao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.volumeTexture);
    gl.uniform1i(this.uniforms.u_volume, 0);

    const { dimX, dimY, dimZ, spacingX, spacingY, spacingZ, minHu, maxHu } = volume;
    gl.uniform3f(this.uniforms.u_volumeDim, dimX, dimY, dimZ);

    // Normalized physical aspect bounding box
    const physX = dimX * spacingX;
    const physY = dimY * spacingY;
    const physZ = dimZ * spacingZ;
    const maxPhys = Math.max(physX, physY, physZ);
    gl.uniform3f(this.uniforms.u_boxSize, physX / maxPhys, physY / maxPhys, physZ / maxPhys);

    // Canonical Upright Anterior Orientation + Turntable Yaw & Nodding Pitch
    const radYaw = (options.yawDeg * Math.PI) / 180;
    const radPitch = (options.pitchDeg * Math.PI) / 180;
    const cosY = Math.cos(radYaw), sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch), sinP = Math.sin(radPitch);

    // Column-major 3x3 orientation matrix: M = M_base * R_cam
    // Maps camera coordinates (Right, Up, Forward) into volume space (Lateral, A-P, Superior-Inferior)
    const rotMat = new Float32Array([
      // Column 0
      cosY,
      -sinY,
      0.0,
      // Column 1
      sinY * sinP,
      cosY * sinP,
      -cosP,
      // Column 2
      sinY * cosP,
      cosY * cosP,
      sinP
    ]);
    gl.uniformMatrix3fv(this.uniforms.u_rotMatrix, false, rotMat);

    // Pan & Zoom (Pan in actual pixels)
    gl.uniform2f(this.uniforms.u_pan, options.panX, options.panY);
    gl.uniform1f(this.uniforms.u_zoom, options.zoom);
    gl.uniform2f(this.uniforms.u_resolution, width, height);

    // Thresholds & Ranges
    const huMin = (minHu !== undefined && isFinite(minHu)) ? minHu : -1024;
    const huMax = (maxHu !== undefined && isFinite(maxHu) && maxHu > huMin) ? maxHu : (huMin + 2048);
    gl.uniform1f(this.uniforms.u_thresholdMin, options.thresholdMin);
    gl.uniform1f(this.uniforms.u_thresholdMax, options.thresholdMax);
    gl.uniform1f(this.uniforms.u_huMin, huMin);
    gl.uniform1f(this.uniforms.u_huMax, huMax);
    gl.uniform1f(this.uniforms.u_clipPlaneZ, options.clipPlaneZ);

    // Preset & Colors
    let presetIdNum = 0;
    if (options.preset.id === 'bone') presetIdNum = 0;
    else if (options.preset.id === 'angio') presetIdNum = 1;
    else if (options.preset.id === 'skin') presetIdNum = 2;
    else if (options.preset.id === 'dental') presetIdNum = 3;
    else if (options.preset.id === 'mip3d') presetIdNum = 4;
    // @ts-ignore
    else if (options.preset.id === 'cinematic_bone') presetIdNum = 5;
    else if (options.preset.id === 'brain') presetIdNum = 6;

    gl.uniform1i(this.uniforms.u_presetId, presetIdNum);
    gl.uniform3f(
      this.uniforms.u_baseColor,
      options.preset.colorGrad.r / 255,
      options.preset.colorGrad.g / 255,
      options.preset.colorGrad.b / 255
    );

    gl.uniform1f(this.uniforms.u_ambient, options.preset.ambient || 0.22);
    gl.uniform1f(this.uniforms.u_diffuse, options.preset.diffuse || 0.78);
    gl.uniform1f(this.uniforms.u_specularPower, options.specularPower ?? options.preset.specularPower ?? 48.0);
    gl.uniform1f(this.uniforms.u_specularIntensity, options.specularIntensity ?? 0.65);
    gl.uniform1f(this.uniforms.u_opacityMultiplier, options.preset.opacityMultiplier || 0.90);
    gl.uniform1i(this.uniforms.u_enableAO, options.enableAmbientOcclusion ? 1 : 0);

    // Quality Step Parameters
    const isUltra = options.quality === 'ultra';
    const isFast = options.quality === 'fast';
    const maxSteps = isUltra ? 450 : (isFast ? 180 : 300);
    const stepSize = isUltra ? 0.0022 : (isFast ? 0.0055 : 0.0033);

    gl.uniform1i(this.uniforms.u_maxSteps, maxSteps);
    gl.uniform1f(this.uniforms.u_stepSize, stepSize);

    // Draw Call
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (!this.gl) return;
    if (this.volumeTexture) this.gl.deleteTexture(this.volumeTexture);
    if (this.program) this.gl.deleteProgram(this.program);
    if (this.quadVao) this.gl.deleteVertexArray(this.quadVao);
    this.gl = null;
    this.program = null;
    this.volumeTexture = null;
    this.quadVao = null;
  }
}
