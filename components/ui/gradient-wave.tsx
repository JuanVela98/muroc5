"use client";

import { useEffect, useRef } from "react";

/**
 * Gradient Wave — fondo interactivo animado (WebGL).
 *
 * Basado en el componente "Gradient Wave" de designali-in (21st.dev):
 * un mesh-gradient animado estilo Stripe implementado con un motor
 * WebGL minimalista (MiniGL), sin dependencias externas.
 *
 * Extra: interactividad con el puntero (parallax suave del mesh) y
 * pausa automática cuando se prefiere menos movimiento.
 */

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Mat4 = number[];

function normalizeColor(hex: number): Vec3 {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (255 & hex) / 255,
  ];
}

type UniformValue = number | number[] | Uniform[] | Record<string, Uniform>;

interface UniformProps {
  type?: "float" | "int" | "vec2" | "vec3" | "vec4" | "mat4" | "struct" | "array";
  value: UniformValue;
  excludeFrom?: "vertex" | "fragment";
  transpose?: boolean;
}

const UNIFORM_TYPE_FNS: Record<string, string> = {
  float: "1f",
  int: "1i",
  vec2: "2fv",
  vec3: "3fv",
  vec4: "4fv",
  mat4: "Matrix4fv",
};

class Uniform {
  type: NonNullable<UniformProps["type"]>;
  value: UniformValue;
  excludeFrom?: "vertex" | "fragment";
  transpose?: boolean;
  private typeFn: string;
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext, props: UniformProps) {
    this.gl = gl;
    this.type = props.type ?? "float";
    this.value = props.value;
    this.excludeFrom = props.excludeFrom;
    this.transpose = props.transpose;
    this.typeFn = UNIFORM_TYPE_FNS[this.type] || "1f";
  }

  update(location: WebGLUniformLocation | null) {
    if (this.value === undefined || location === null) return;
    const gl = this.gl;
    if (this.typeFn.startsWith("Matrix")) {
      gl.uniformMatrix4fv(location, this.transpose ?? false, this.value as Float32List);
    } else {
      const fn = `uniform${this.typeFn}` as keyof WebGLRenderingContext;
      (gl[fn] as (loc: WebGLUniformLocation, value: Float32List | number) => void)(
        location,
        this.value as Float32List,
      );
    }
  }

  /** Declaración GLSL de este uniform (soporta struct y array recursivo). */
  getDeclaration(name: string, mode: "vertex" | "fragment", length?: number): string {
    if (this.excludeFrom === mode) return "";
    if (this.type === "array") {
      const items = this.value as Uniform[];
      return (
        items[0].getDeclaration(name, mode, items.length) +
        `\nconst int ${name}_length = ${items.length};`
      );
    }
    if (this.type === "struct") {
      const structName =
        name.replace("u_", "").charAt(0).toUpperCase() + name.replace("u_", "").slice(1);
      const members = Object.entries(this.value as Record<string, Uniform>)
        .map(([key, u]) => u.getDeclaration(key, mode).replace(/^uniform/, ""))
        .join("");
      return `uniform struct ${structName} {\n${members}\n} ${name}${length ? `[${length}]` : ""};`;
    }
    return `uniform ${this.type} ${name}${length ? `[${length}]` : ""};`;
  }
}

class Attribute {
  type: number;
  normalized = false;
  buffer: WebGLBuffer | null;
  target: number;
  size: number;
  values?: Float32Array | Uint16Array;
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext, props: { target: number; size: number; type?: number }) {
    this.gl = gl;
    this.type = props.type ?? gl.FLOAT;
    this.target = props.target;
    this.size = props.size;
    this.buffer = gl.createBuffer();
  }

  update() {
    if (!this.values) return;
    const gl = this.gl;
    gl.bindBuffer(this.target, this.buffer);
    gl.bufferData(this.target, this.values, gl.STATIC_DRAW);
  }

  attach(name: string, program: WebGLProgram) {
    const gl = this.gl;
    const location = gl.getAttribLocation(program, name);
    if (this.target === gl.ARRAY_BUFFER) {
      gl.bindBuffer(this.target, this.buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, this.size, this.type, this.normalized, 0, 0);
    }
    return location;
  }

  use(location: number) {
    const gl = this.gl;
    gl.bindBuffer(this.target, this.buffer);
    if (this.target === gl.ARRAY_BUFFER) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, this.size, this.type, this.normalized, 0, 0);
    }
  }
}

class Material {
  uniforms: Record<string, Uniform>;
  uniformInstances: { uniform: Uniform; location: WebGLUniformLocation | null }[] = [];
  program: WebGLProgram;
  private gl: WebGLRenderingContext;

  constructor(
    gl: WebGLRenderingContext,
    commonUniforms: Record<string, Uniform>,
    vertexShaderSource: string,
    fragmentShaderSource: string,
    uniforms: Record<string, Uniform> = {},
  ) {
    this.gl = gl;
    this.uniforms = uniforms;

    const getShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        throw new Error("Shader compilation error");
      }
      return shader;
    };

    const getUniformDeclarations = (
      list: Record<string, Uniform>,
      mode: "vertex" | "fragment",
    ) =>
      Object.entries(list)
        .map(([name, uniform]) => uniform.getDeclaration(name, mode))
        .join("\n");

    const vertex = [
      "precision highp float;",
      "attribute vec4 position;",
      "attribute vec2 uv;",
      "attribute vec2 uvNorm;",
      getUniformDeclarations(commonUniforms, "vertex"),
      getUniformDeclarations(uniforms, "vertex"),
      vertexShaderSource,
    ].join("\n");

    const fragment = [
      "precision highp float;",
      getUniformDeclarations(commonUniforms, "fragment"),
      getUniformDeclarations(uniforms, "fragment"),
      fragmentShaderSource,
    ].join("\n");

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, getShader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(this.program, getShader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program));
      throw new Error("Program linking error");
    }
    gl.useProgram(this.program);
    this.attachUniforms(undefined, commonUniforms);
    this.attachUniforms(undefined, this.uniforms);
  }

  private attachUniforms(
    prefix: string | undefined,
    value: Uniform | Record<string, Uniform>,
  ) {
    const gl = this.gl;
    if (prefix === undefined) {
      Object.entries(value as Record<string, Uniform>).forEach(([name, u]) =>
        this.attachUniforms(name, u),
      );
    } else if (value instanceof Uniform && value.type === "array") {
      (value.value as Uniform[]).forEach((u, i) => this.attachUniforms(`${prefix}[${i}]`, u));
    } else if (value instanceof Uniform && value.type === "struct") {
      Object.entries(value.value as Record<string, Uniform>).forEach(([name, u]) =>
        this.attachUniforms(`${prefix}.${name}`, u),
      );
    } else if (value instanceof Uniform) {
      this.uniformInstances.push({
        uniform: value,
        location: gl.getUniformLocation(this.program, prefix),
      });
    }
  }
}

class PlaneGeometry {
  width = 1;
  height = 1;
  xSegCount = 0;
  ySegCount = 0;
  vertexCount = 0;
  attributes: Record<string, Attribute>;
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.attributes = {
      position: new Attribute(gl, { target: gl.ARRAY_BUFFER, size: 3 }),
      uv: new Attribute(gl, { target: gl.ARRAY_BUFFER, size: 2 }),
      uvNorm: new Attribute(gl, { target: gl.ARRAY_BUFFER, size: 2 }),
      index: new Attribute(gl, {
        target: gl.ELEMENT_ARRAY_BUFFER,
        size: 3,
        type: gl.UNSIGNED_SHORT,
      }),
    };
  }

  setTopology(xSegCount = 1, ySegCount = 1) {
    this.xSegCount = xSegCount;
    this.ySegCount = ySegCount;
    this.vertexCount = (this.xSegCount + 1) * (this.ySegCount + 1);
    const quadCount = this.xSegCount * this.ySegCount * 2;
    this.attributes.uv.values = new Float32Array(2 * this.vertexCount);
    this.attributes.uvNorm.values = new Float32Array(2 * this.vertexCount);
    this.attributes.index.values = new Uint16Array(3 * quadCount);
    for (let y = 0; y <= this.ySegCount; y++) {
      for (let x = 0; x <= this.xSegCount; x++) {
        const i = y * (this.xSegCount + 1) + x;
        this.attributes.uv.values[2 * i] = x / this.xSegCount;
        this.attributes.uv.values[2 * i + 1] = 1 - y / this.ySegCount;
        this.attributes.uvNorm.values[2 * i] = (x / this.xSegCount) * 2 - 1;
        this.attributes.uvNorm.values[2 * i + 1] = 1 - (y / this.ySegCount) * 2;
        if (x < this.xSegCount && y < this.ySegCount) {
          const quad = y * this.xSegCount + x;
          this.attributes.index.values[6 * quad] = i;
          this.attributes.index.values[6 * quad + 1] = i + 1 + this.xSegCount;
          this.attributes.index.values[6 * quad + 2] = i + 1;
          this.attributes.index.values[6 * quad + 3] = i + 1;
          this.attributes.index.values[6 * quad + 4] = i + 1 + this.xSegCount;
          this.attributes.index.values[6 * quad + 5] = i + 2 + this.xSegCount;
        }
      }
    }
    this.attributes.uv.update();
    this.attributes.uvNorm.update();
    this.attributes.index.update();
  }

  setSize(width = 1, height = 1) {
    this.width = width;
    this.height = height;
    this.attributes.position.values = new Float32Array(3 * this.vertexCount);
    const left = width / -2;
    const bottom = height / -2;
    const xStep = width / this.xSegCount;
    const yStep = height / this.ySegCount;
    for (let y = 0; y <= this.ySegCount; y++) {
      const yPos = bottom + y * yStep;
      for (let x = 0; x <= this.xSegCount; x++) {
        const xPos = left + x * xStep;
        const i = y * (this.xSegCount + 1) + x;
        this.attributes.position.values[3 * i] = xPos;
        this.attributes.position.values[3 * i + 1] = -yPos;
        this.attributes.position.values[3 * i + 2] = 0;
      }
    }
    this.attributes.position.update();
  }
}

class Mesh {
  geometry: PlaneGeometry;
  material: Material;
  attributeInstances: { attribute: Attribute; location: number }[] = [];
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext, geometry: PlaneGeometry, material: Material) {
    this.gl = gl;
    this.geometry = geometry;
    this.material = material;
    Object.entries(geometry.attributes).forEach(([name, attr]) => {
      this.attributeInstances.push({
        attribute: attr,
        location: attr.attach(name, material.program),
      });
    });
  }

  draw() {
    const gl = this.gl;
    gl.useProgram(this.material.program);
    this.material.uniformInstances.forEach(({ uniform, location }) => uniform.update(location));
    this.attributeInstances.forEach(({ attribute, location }) => attribute.use(location));
    gl.drawElements(
      gl.TRIANGLES,
      this.geometry.attributes.index.values?.length ?? 0,
      gl.UNSIGNED_SHORT,
      0,
    );
  }
}

class MiniGL {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  meshes: Mesh[] = [];
  width = 640;
  height = 480;
  commonUniforms: Record<string, Uniform>;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) throw new Error("WebGL no está soportado en este navegador");
    this.gl = gl;

    const identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    this.commonUniforms = {
      projectionMatrix: new Uniform(gl, { type: "mat4", value: identity }),
      modelViewMatrix: new Uniform(gl, { type: "mat4", value: identity }),
      resolution: new Uniform(gl, { type: "vec2", value: [1, 1] }),
      aspectRatio: new Uniform(gl, { type: "float", value: 1 }),
    };
  }

  setSize(width = 640, height = 480) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.commonUniforms.resolution.value = [width, height];
    this.commonUniforms.aspectRatio.value = width / height;
  }

  setOrthographicCamera() {
    this.commonUniforms.projectionMatrix.value = [
      2 / this.width, 0, 0, 0,
      0, 2 / this.height, 0, 0,
      0, 0, -0.001, 0,
      0, 0, 0, 1,
    ];
  }

  render() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.meshes.forEach((mesh) => mesh.draw());
  }
}

interface Deform {
  incline: number;
  offsetTop: number;
  offsetBottom: number;
  noiseFreq: Vec2;
  noiseAmp: number;
  noiseSpeed: number;
  noiseFlow: number;
  noiseSeed: number;
}

/** Exportado para permitir pruebas unitarias del motor WebGL. */
export class Gradient {
  canvas: HTMLCanvasElement;
  colors: string[];
  minigl: MiniGL;
  mesh!: {
    geometry: PlaneGeometry;
    material: Material;
  };
  time = 0;
  last = 0;
  animationId?: number;
  isPlaying = false;
  interactive = true;
  private baseIncline = 0;
  private pointer = { x: 0.5, y: 0.5 };
  private targetPointer = { x: 0.5, y: 0.5 };

  animate = (now: number) => {
    if (!this.isPlaying) return;
    this.time += Math.min(now - this.last, 1000 / 15);
    this.last = now;

    // Parallax suave: el mesh se inclina/desplaza siguiendo al puntero.
    if (this.interactive) {
      this.pointer.x += (this.targetPointer.x - this.pointer.x) * 0.06;
      this.pointer.y += (this.targetPointer.y - this.pointer.y) * 0.06;
      const uVertDeform = this.mesh.material.uniforms.u_vertDeform
        .value as unknown as Record<keyof Deform, Uniform>;
      const dy = this.pointer.y - 0.5;
      const dx = this.pointer.x - 0.5;
      uVertDeform.offsetTop.value = -0.5 + dy * 0.25;
      uVertDeform.offsetBottom.value = -0.5 + dy * 0.25;
      uVertDeform.incline.value = this.baseIncline + dx * 0.4;
    }

    this.mesh.material.uniforms.u_time.value = this.time;
    this.minigl.render();
    this.animationId = requestAnimationFrame(this.animate);
  };

  private resizeHandler = () => this.resize();
  private pointerHandler = (e: PointerEvent) => {
    this.targetPointer = {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    };
  };
  private pointerLeaveHandler = () => {
    this.targetPointer = { x: 0.5, y: 0.5 };
  };

  constructor(canvas: HTMLCanvasElement, colors: string[]) {
    this.canvas = canvas;
    this.colors = colors;
    this.minigl = new MiniGL(canvas);
    this.init();
  }

  init() {
    const gl = this.minigl.gl;
    const colorPoints = this.colors.map((color) =>
      normalizeColor(parseInt(color.replace("#", "0x"), 16)),
    );

    const uniforms: Record<string, Uniform> = {
      u_time: new Uniform(gl, { value: 0 }),
      u_shadow_power: new Uniform(gl, { value: 5 }),
      u_darken_top: new Uniform(gl, { value: 0 }),
      u_active_colors: new Uniform(gl, { type: "vec4", value: [1, 1, 1, 1] }),
      u_global: new Uniform(gl, {
        type: "struct",
        value: {
          noiseFreq: new Uniform(gl, { type: "vec2", value: [14e-5, 29e-5] }),
          noiseSpeed: new Uniform(gl, { value: 5e-6 }),
        },
      }),
      u_vertDeform: new Uniform(gl, {
        type: "struct",
        excludeFrom: "fragment",
        value: {
          incline: new Uniform(gl, { value: 0 }),
          offsetTop: new Uniform(gl, { value: -0.5 }),
          offsetBottom: new Uniform(gl, { value: -0.5 }),
          noiseFreq: new Uniform(gl, { type: "vec2", value: [3, 4] }),
          noiseAmp: new Uniform(gl, { value: 320 }),
          noiseSpeed: new Uniform(gl, { value: 10 }),
          noiseFlow: new Uniform(gl, { value: 3 }),
          noiseSeed: new Uniform(gl, { value: 5 }),
        },
      }),
      u_baseColor: new Uniform(gl, {
        type: "vec3",
        value: colorPoints[0] ?? [0, 0, 0],
        excludeFrom: "fragment",
      }),
      u_waveLayers: new Uniform(gl, {
        type: "array",
        value: [],
        excludeFrom: "fragment",
      }),
    };

    for (let i = 1; i < colorPoints.length; i++) {
      (uniforms.u_waveLayers.value as Uniform[]).push(
        new Uniform(gl, {
          type: "struct",
          value: {
            color: new Uniform(gl, { type: "vec3", value: colorPoints[i] }),
            noiseFreq: new Uniform(gl, {
              type: "vec2",
              value: [2 + i / colorPoints.length, 3 + i / colorPoints.length],
            }),
            noiseSpeed: new Uniform(gl, { value: 11 + 0.3 * i }),
            noiseFlow: new Uniform(gl, { value: 6.5 + 0.3 * i }),
            noiseSeed: new Uniform(gl, { value: 5 + 10 * i }),
            noiseFloor: new Uniform(gl, { value: 0.1 }),
            noiseCeil: new Uniform(gl, { value: 0.63 + 0.07 * i }),
          },
        }),
      );
    }

    const vertexShader = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 blendNormal(vec3 base, vec3 blend) { return blend; }
vec3 blendNormal(vec3 base, vec3 blend, float opacity) { return (blend * opacity + base * (1.0 - opacity)); }

varying vec3 v_color;

void main() {
  float time = u_time * u_global.noiseSpeed;
  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;
  float tilt = resolution.y / 2.0 * uvNorm.y;
  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;
  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);

  float noise = snoise(vec3(
    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,
    noiseCoord.y * u_vertDeform.noiseFreq.y,
    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed
  )) * u_vertDeform.noiseAmp;

  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
  noise = max(0.0, noise);

  vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);

  v_color = u_baseColor;

  for (int i = 0; i < u_waveLayers_length; i++) {
    if (u_active_colors[i + 1] == 1.) {
      WaveLayers layer = u_waveLayers[i];
      float layerNoise = smoothstep(
        layer.noiseFloor,
        layer.noiseCeil,
        snoise(vec3(
          noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,
          noiseCoord.y * layer.noiseFreq.y,
          time * layer.noiseSpeed + layer.noiseSeed
        )) / 2.0 + 0.5
      );
      v_color = blendNormal(v_color, layer.color, pow(layerNoise, 4.));
    }
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

    const fragmentShader = `
varying vec3 v_color;

void main() {
  vec3 color = v_color;
  if (u_darken_top == 1.0) {
    vec2 st = gl_FragCoord.xy/resolution.xy;
    color.g -= pow(st.y + sin(-12.0) * st.x, u_shadow_power) * 0.4;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

    const material = new Material(gl, this.minigl.commonUniforms, vertexShader, fragmentShader, uniforms);
    const geometry = new PlaneGeometry(gl);
    this.mesh = { geometry, material };
    this.minigl.meshes.push(new Mesh(gl, geometry, material));
    this.baseIncline = (uniforms.u_vertDeform.value as Record<string, Uniform>).incline
      .value as number;
    this.resize();
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("pointermove", this.pointerHandler, { passive: true });
    window.addEventListener("pointerleave", this.pointerLeaveHandler);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.minigl.setSize(width, height);
    this.minigl.setOrthographicCamera();
    const xSegCount = Math.ceil(width * 0.02);
    const ySegCount = Math.ceil(height * 0.05);
    this.mesh.geometry.setTopology(xSegCount, ySegCount);
    this.mesh.geometry.setSize(width, height);
    this.mesh.material.uniforms.u_shadow_power.value = width < 600 ? 5 : 6;
  }

  start() {
    this.isPlaying = true;
    this.animationId = requestAnimationFrame(this.animate);
  }

  stop() {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  destroy() {
    this.stop();
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("pointermove", this.pointerHandler);
    window.removeEventListener("pointerleave", this.pointerLeaveHandler);
  }
}

export interface GradientWaveProps {
  /** Colores del gradiente: [0] color base, [1..] capas de onda. */
  colors?: string[];
  /** Reproducir/pausar la animación. */
  isPlaying?: boolean;
  /** Clases extra para el contenedor. */
  className?: string;
  /** Potencia de la sombra superior (con darkenTop). */
  shadowPower?: number;
  /** Oscurecer la parte superior del gradiente. */
  darkenTop?: boolean;
  /** Velocidad del ruido global. */
  noiseSpeed?: number;
  /** Frecuencia del ruido global [x, y]. */
  noiseFrequency?: [number, number];
  /** Deformación vertical del mesh. */
  deform?: { incline?: number; noiseAmp?: number; noiseFlow?: number };
  /** Reaccionar al movimiento del puntero (parallax suave). */
  interactive?: boolean;
}

const defaultColors = ["#38bdf8", "#ffffff", "#38bdf8", "#ffffff", "#38bdf8", "#ffffff"];

export function GradientWave({
  colors = defaultColors,
  isPlaying = true,
  className = "",
  shadowPower = 8,
  darkenTop = false,
  noiseSpeed = 1e-5,
  noiseFrequency = [1e-4, 9e-4],
  deform = { incline: 0.5, noiseAmp: 250, noiseFlow: 5 },
  interactive = true,
}: GradientWaveProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    container.appendChild(canvas);

    let gradient: Gradient | null = null;
    try {
      gradient = new Gradient(canvas, colors);
      gradient.mesh.material.uniforms.u_shadow_power.value = shadowPower;
      gradient.mesh.material.uniforms.u_darken_top.value = darkenTop ? 1 : 0;
      const uGlobal = gradient.mesh.material.uniforms.u_global.value as unknown as Record<
        "noiseFreq" | "noiseSpeed",
        Uniform
      >;
      uGlobal.noiseFreq.value = noiseFrequency;
      uGlobal.noiseSpeed.value = noiseSpeed;
      Object.assign(gradient.mesh.material.uniforms.u_vertDeform.value, deform);
      gradient.interactive = interactive;

      // Pausar la animación si el usuario prefiere menos movimiento
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isPlaying && !reducedMotion) gradient.start();
      else gradient.minigl.render();
    } catch (error) {
      console.error("No se pudo inicializar el gradiente:", error);
    }

    return () => {
      gradient?.destroy();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [colors, isPlaying, shadowPower, darkenTop, noiseSpeed, noiseFrequency, deform, interactive]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-0 w-full h-full overflow-hidden ${className}`}
    />
  );
}
