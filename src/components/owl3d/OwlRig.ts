/**
 * Corujinha 3D (three.js) — modelada em código a partir da mascote oficial.
 * Sem dependências de React: o componente CondominioOwl cria, anima e descarta.
 *
 * Para trocar por um modelo profissional (.glb) no futuro, basta implementar a
 * mesma interface (setState, setExpression, setMouth, setLook, setEntrance, dispose).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type OwlState = "idle" | "greeting" | "talking" | "happy" | "thinking" | "listening" | "goodbye";
export type OwlExpression = "neutral" | "happy" | "surprised" | "sad" | "curious";
export type Mouth = { open: number; wide: number; round: number };

const C = {
  body: "#6652f2", bodyTop: "#8b7bff", bodyBottom: "#4a35dc", sheen: "#a99cff",
  eye: "#fdfcff", eyeRing: "#d8d0ff", navy: "#1b2150", beak: "#f08c12", beakIn: "#7a2d10",
  cheek: "#ff9cb4", scarf: "#10c3b0", scarfDark: "#0aa596", belly: "#ffe3bf", mark: "#f5c430", feet: "#f4a51c",
};

// Suavização exponencial independente do frame rate
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

type Targets = {
  lean: number; tilt: number; turn: number; nod: number; bob: number;
  wingL: number; wingR: number; waveL: number; waveR: number;
  happy: number; eyeScale: number; lid: number; lookX: number; lookY: number;
  tuft: number; cheek: number; brow: number;
};
const BASE: Targets = { lean: 0, tilt: 0, turn: 0, nod: 0, bob: 1, wingL: 0.15, wingR: 0.15, waveL: 0, waveR: 0, happy: 0, eyeScale: 1, lid: 0, lookX: 0, lookY: 0, tuft: 0, cheek: 1, brow: 0 };

const STATE_TARGETS: Record<OwlState, Partial<Targets>> = {
  idle: {},
  greeting: { wingR: 2.35, waveR: 1, happy: 0.85, tilt: -0.08, bob: 1.6, cheek: 1.25 },
  talking: { bob: 0.8 },
  happy: { happy: 1, bob: 2.2, cheek: 1.35, wingL: 0.55, wingR: 0.55, tuft: 0.3 },
  thinking: { tilt: 0.2, turn: -0.12, lookX: -0.5, lookY: 0.55, wingR: 0.75, lid: 0.18, bob: 0.5 },
  listening: { lean: 0.09, eyeScale: 1.08, tuft: 0.6, tilt: -0.07, bob: 0.6 },
  goodbye: { wingR: 2.45, wingL: 2.2, waveR: 1, waveL: 1, happy: 0.9, bob: 1.6, cheek: 1.3 },
};
const EXPR_TARGETS: Record<OwlExpression, Partial<Targets>> = {
  neutral: {},
  happy: { happy: 1, cheek: 1.3 },
  surprised: { eyeScale: 1.14, tuft: 1, lid: -0.1 },
  sad: { lid: 0.42, lookY: -0.45, tuft: -0.6, tilt: 0.1 },
  curious: { tilt: 0.16, eyeScale: 1.06, lookX: 0.35 },
};

function gradientBodyGeometry() {
  const g = new THREE.SphereGeometry(1, 96, 64);
  const top = new THREE.Color(C.bodyTop), mid = new THREE.Color(C.body), bot = new THREE.Color(C.bodyBottom);
  const cols: number[] = []; const p = g.attributes.position; const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 1.6)); else c.copy(mid).lerp(bot, Math.pow(-y, 1.3) * 0.9);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

/** Textura sutil de “penugem” para o relevo do corpo (gerada no navegador). */
function plushTexture() {
  const s = 256; const cv = document.createElement("canvas"); cv.width = cv.height = s;
  const x = cv.getContext("2d")!; x.fillStyle = "#808080"; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const px = Math.random() * s, py = Math.random() * s, r = 1 + Math.random() * 2.2, v = 110 + Math.random() * 60;
    x.fillStyle = `rgba(${v},${v},${v},0.35)`; x.beginPath(); x.ellipse(px, py, r, r * 2.4, Math.random() * 0.6 - 0.3, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3); return t;
}

function shadowTexture() {
  const s = 128; const cv = document.createElement("canvas"); cv.width = cv.height = s;
  const x = cv.getContext("2d")!; const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, "rgba(40,20,110,0.45)"); gr.addColorStop(0.55, "rgba(40,20,110,0.18)"); gr.addColorStop(1, "rgba(40,20,110,0)");
  x.fillStyle = gr; x.fillRect(0, 0, s, s); return new THREE.CanvasTexture(cv);
}

export class OwlRig {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private root = new THREE.Group();
  private body!: THREE.Mesh; private face = new THREE.Group();
  private eyes: { group: THREE.Group; pupil: THREE.Group; arc: THREE.Mesh; lid: THREE.Mesh }[] = [];
  private beakLower!: THREE.Group; private mouthIn!: THREE.Mesh; private beakUpper!: THREE.Mesh;
  private wings: { pivot: THREE.Group; side: 1 | -1 }[] = [];
  private tufts: THREE.Mesh[] = []; private cheeks: THREE.Mesh[] = []; private shadow!: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];

  private state: OwlState = "idle"; private expression: OwlExpression = "neutral";
  private cur: Targets = { ...BASE }; private mouth: Mouth = { open: 0, wide: 0, round: 0 }; private mouthCur: Mouth = { open: 0, wide: 0, round: 0 };
  private look = { x: 0, y: 0, active: false };
  private entrance = 1; private t = 0; private nextBlink = 2; private blink = 0; private stateTime = 0;
  private raf = 0; private last = 0; private running = false; private visible = true;

  constructor(private canvas: HTMLCanvasElement, opts: { quality?: "alta" | "leve" } = {}) {
    const leve = opts.quality === "leve";
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !leve, powerPreference: leve ? "low-power" : "default" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, leve ? 1.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
    this.scene.environment = env; this.disposables.push(env);
    this.scene.environmentIntensity = 0.32;

    const key = new THREE.DirectionalLight("#fff4e6", 2.4); key.position.set(2.2, 3, 4); this.scene.add(key);
    const fill = new THREE.DirectionalLight("#cfd8ff", 0.7); fill.position.set(-3, 1, 2); this.scene.add(fill);
    const rim = new THREE.DirectionalLight("#b9a8ff", 2.2); rim.position.set(-1.5, 2.5, -3); this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight("#9be7ff", 1.1); rim2.position.set(2.5, 0.5, -2.5); this.scene.add(rim2);
    this.scene.add(new THREE.HemisphereLight("#f3efff", "#4a3aa8", 0.55));

    this.camera.position.set(0, 0.15, 7.2); this.camera.lookAt(0, -0.05, 0);
    this.build();
    this.scene.add(this.root);
  }

  private mat(p: THREE.MeshPhysicalMaterialParameters) { const m = new THREE.MeshPhysicalMaterial(p); this.disposables.push(m); return m; }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material) { this.disposables.push(g); return new THREE.Mesh(g, m); }

  private build() {
    const plush = plushTexture(); this.disposables.push(plush);
    const bodyMat = this.mat({ vertexColors: true, roughness: 0.62, sheen: 0.7, sheenColor: new THREE.Color(C.sheen), sheenRoughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.6, bumpMap: plush, bumpScale: 0.6 });
    const featherMat = this.mat({ color: C.body, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(C.sheen), sheenRoughness: 0.5 });
    const featherDark = this.mat({ color: "#6250ee", roughness: 0.6, sheen: 0.8, sheenColor: new THREE.Color(C.sheen), sheenRoughness: 0.5 });

    // Corpo
    const body = this.mesh(gradientBodyGeometry(), bodyMat); body.scale.set(1, 0.98, 0.94); this.body = body; this.root.add(body);

    // Barriguinha creme com penas douradas
    const bellyMat = this.mat({ color: C.belly, roughness: 0.7, sheen: 0.4, sheenColor: new THREE.Color("#fff3e0"), sheenRoughness: 0.6, emissive: new THREE.Color("#ffe8cc"), emissiveIntensity: 0.12 });
    const belly = this.mesh(new THREE.SphereGeometry(0.74, 64, 48), bellyMat); belly.position.set(0, -0.42, 0.36); belly.scale.set(1, 0.82, 0.78); this.root.add(belly);
    const markMat = this.mat({ color: C.mark, roughness: 0.3, clearcoat: 0.7, metalness: 0.1, emissive: new THREE.Color("#c48a00"), emissiveIntensity: 0.15 });
    const markGeo = new THREE.TorusGeometry(0.075, 0.018, 10, 24, Math.PI); this.disposables.push(markGeo);
    const marks: [number, number][] = [[-0.2, -0.5], [0, -0.48], [0.2, -0.5], [-0.1, -0.7], [0.1, -0.7]];
    for (const [x, y] of marks) {
      const m = new THREE.Mesh(markGeo, markMat);
      const nx = x / 0.74, ny = (y + 0.42) / (0.82 * 0.74); const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      m.position.set(x, y, 0.36 + nz * 0.74 * 0.78 + 0.005); m.rotation.z = Math.PI; m.lookAt(m.position.clone().add(new THREE.Vector3(nx * 0.6, ny * 0.6, 1))); m.rotateZ(Math.PI);
      this.root.add(m);
    }

    // Cachecol turquesa com nó e pingente
    const scarfMat = this.mat({ color: C.scarf, roughness: 0.4, sheen: 0.25, sheenColor: new THREE.Color("#8ffff0"), clearcoat: 0.35 });
    const scarf = this.mesh(new THREE.TorusGeometry(0.9, 0.085, 24, 96), scarfMat); scarf.rotation.x = Math.PI / 2; scarf.position.y = -0.2; scarf.scale.set(1.04, 1.0, 1); this.root.add(scarf);
    const knot = this.mesh(new THREE.SphereGeometry(0.11, 24, 16), scarfMat); knot.position.set(0.42, -0.23, 0.86); this.root.add(knot);
    const tassel = this.mesh(new THREE.ConeGeometry(0.08, 0.3, 20), this.mat({ color: C.scarfDark, roughness: 0.5 })); tassel.position.set(0.48, -0.44, 0.83); tassel.rotation.z = 0.12; this.root.add(tassel);

    // Rosto (gira sobre o corpo para inclinar e virar a cabeça)
    this.root.add(this.face);
    const eyeMat = this.mat({ color: C.eye, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.22 });
    const ringMat = this.mat({ color: C.eyeRing, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color("#ffffff") });
    const navyMat = this.mat({ color: C.navy, roughness: 0.3, clearcoat: 0.8 });
    const shineMat = new THREE.MeshBasicMaterial({ color: "#ffffff" }); this.disposables.push(shineMat);
    const lidMat = this.mat({ color: C.body, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(C.sheen), side: THREE.DoubleSide });
    for (const side of [-1, 1] as const) {
      const g = new THREE.Group(); g.position.set(side * 0.37, 0.27, 0.73); g.rotation.y = side * 0.32; g.rotation.x = -0.12;
      const ring = this.mesh(new THREE.TorusGeometry(0.36, 0.055, 16, 48), ringMat); ring.scale.z = 0.6; g.add(ring);
      const white = this.mesh(new THREE.SphereGeometry(0.355, 48, 32), eyeMat); white.scale.z = 0.5; g.add(white);
      const pupil = new THREE.Group(); pupil.position.z = 0.15;
      const iris = this.mesh(new THREE.SphereGeometry(0.17, 32, 24), navyMat); iris.scale.z = 0.35; pupil.add(iris);
      const s1 = this.mesh(new THREE.SphereGeometry(0.055, 16, 12), shineMat); s1.position.set(0.06, 0.07, 0.06); pupil.add(s1);
      const s2 = this.mesh(new THREE.SphereGeometry(0.025, 12, 8), shineMat); s2.position.set(-0.06, -0.05, 0.06); pupil.add(s2);
      g.add(pupil);
      const arc = this.mesh(new THREE.TorusGeometry(0.15, 0.04, 14, 36, Math.PI), navyMat); arc.position.set(0, -0.03, 0.175); arc.scale.set(1, 1.05, 0.6); g.add(arc);
      const lid = this.mesh(new THREE.SphereGeometry(0.37, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), lidMat); lid.scale.z = 0.55; g.add(lid);
      this.face.add(g); this.eyes.push({ group: g, pupil, arc, lid });
    }

    // Bico (parte de baixo articulada para falar)
    const beakMat = this.mat({ color: C.beak, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const beakUpper = this.mesh(new THREE.ConeGeometry(0.13, 0.26, 32), beakMat); beakUpper.position.set(0, 0.0, 0.99); beakUpper.rotation.x = Math.PI / 2 + 0.95; this.face.add(beakUpper); this.beakUpper = beakUpper;
    this.beakLower = new THREE.Group(); this.beakLower.position.set(0, -0.02, 0.95); this.face.add(this.beakLower);
    const lower = this.mesh(new THREE.ConeGeometry(0.1, 0.17, 28), beakMat); lower.position.set(0, -0.05, 0.06); lower.rotation.x = Math.PI / 2 + 1.2; this.beakLower.add(lower);
    this.mouthIn = this.mesh(new THREE.SphereGeometry(0.07, 20, 14), this.mat({ color: C.beakIn, roughness: 0.8 })); this.mouthIn.position.set(0, -0.03, 0.97); this.mouthIn.scale.set(1, 0.2, 0.5); this.face.add(this.mouthIn);

    // Bochechas
    const cheekMat = this.mat({ color: C.cheek, roughness: 0.6, transparent: true, opacity: 0.85 });
    for (const side of [-1, 1]) {
      const ch = this.mesh(new THREE.SphereGeometry(0.075, 20, 14), cheekMat); ch.position.set(side * 0.66, -0.03, 0.69); ch.scale.set(1.2, 0.8, 0.4); ch.lookAt(side * 2, -0.05, 2); this.face.add(ch); this.cheeks.push(ch);
    }

    // Orelhinhas e topete
    for (const side of [-1, 1]) {
      const tf = this.mesh(new THREE.ConeGeometry(0.17, 0.46, 24), featherMat); tf.position.set(side * 0.55, 0.86, 0.02); tf.rotation.z = -side * 0.42; this.face.add(tf); this.tufts.push(tf);
    }
    for (const [x, r] of [[-0.09, 0.45], [0.09, -0.45], [0, 0]] as const) {
      const lf = this.mesh(new THREE.CapsuleGeometry(0.055, r === 0 ? 0.2 : 0.16, 8, 16), featherDark); lf.position.set(x, 1.03 + (r === 0 ? 0.04 : 0), 0.05); lf.rotation.z = r; this.face.add(lf);
    }

    // Asinhas (articuladas no ombro)
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.9, 0.12, 0.22);
      const w = this.mesh(new THREE.CapsuleGeometry(0.16, 0.42, 10, 20), featherMat); w.position.set(side * 0.08, -0.32, 0); w.scale.set(0.85, 1, 0.55); w.rotation.z = side * 0.18;
      pivot.add(w); this.root.add(pivot); this.wings.push({ pivot, side });
    }

    // Pezinhos
    const feetMat = this.mat({ color: C.feet, roughness: 0.32, clearcoat: 0.7, metalness: 0.1 });
    for (const side of [-1, 1]) {
      const f = new THREE.Group(); f.position.set(side * 0.36, -0.98, 0.32);
      for (const a of [-0.45, 0, 0.45]) { const toe = this.mesh(new THREE.CapsuleGeometry(0.065, 0.12, 6, 12), feetMat); toe.rotation.x = Math.PI / 2; toe.rotation.y = a; toe.position.set(Math.sin(a) * 0.09, 0, Math.cos(a) * 0.09); f.add(toe); }
      this.root.add(f);
    }

    // Sombra de contato
    const sh = shadowTexture(); this.disposables.push(sh);
    const shm = new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false }); this.disposables.push(shm);
    this.shadow = this.mesh(new THREE.PlaneGeometry(2.6, 1.1), shm); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.set(0, -1.06, 0.15);
    this.scene.add(this.shadow);
  }

  // ---------- API pública ----------
  setState(s: OwlState) { if (s !== this.state) { this.state = s; this.stateTime = 0; } }
  setExpression(e: OwlExpression) { this.expression = e; }
  setMouth(m: Mouth) { this.mouth = m; }
  /** Direção do olhar (-1..1). Use active=false para voltar ao olhar automático. */
  setLook(x: number, y: number, active = true) { this.look = { x, y, active }; }
  setEntrance(v: number) { this.entrance = v; }

  resize(w: number, h: number) {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Enquadramento: a coruja cabe inteira em qualquer proporção
    const fitH = 3.0, fitW = 3.2;
    const dist = Math.max(fitH / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))), fitW / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
    this.camera.position.set(0, 0.12, dist); this.camera.lookAt(0, -0.02, 0);
    this.camera.updateProjectionMatrix();
  }

  start() { if (this.running) return; this.running = true; this.last = performance.now(); const loop = (now: number) => { if (!this.running) return; this.raf = requestAnimationFrame(loop); if (!this.visible) { this.last = now; return; } const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.update(dt); this.renderer.render(this.scene, this.camera); }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  setVisible(v: boolean) { this.visible = v; }
  renderOnce() { this.update(1 / 60); this.renderer.render(this.scene, this.camera); }

  private update(dt: number) {
    this.t += dt; this.stateTime += dt;
    const tgt: Targets = { ...BASE, ...STATE_TARGETS[this.state] };
    const ex = EXPR_TARGETS[this.expression];
    for (const k of Object.keys(ex) as (keyof Targets)[]) tgt[k] = k === "happy" || k === "cheek" ? Math.max(tgt[k], ex[k]!) : (tgt[k] + ex[k]!);
    if (this.look.active) { tgt.lookX = this.look.x; tgt.lookY = this.look.y; }
    else if (this.state === "idle" || this.state === "talking") { tgt.lookX += Math.sin(this.t * 0.37) * 0.18 + Math.sin(this.t * 0.11) * 0.12; tgt.lookY += Math.sin(this.t * 0.29) * 0.08; }
    for (const k of Object.keys(tgt) as (keyof Targets)[]) this.cur[k] = damp(this.cur[k], tgt[k], k === "happy" ? 6 : 5, dt);
    const c = this.cur;

    // Boca: abre rápido, fecha um pouco mais devagar
    const m = this.mouth, mc = this.mouthCur;
    mc.open = damp(mc.open, m.open, m.open > mc.open ? 28 : 16, dt);
    mc.wide = damp(mc.wide, m.wide, 14, dt); mc.round = damp(mc.round, m.round, 14, dt);

    // Respiração, quique e balanço
    const breath = Math.sin(this.t * 2.1) * 0.012;
    const hop = Math.max(0, Math.sin(this.t * 4.4)) * 0.035 * Math.max(0, c.bob - 1);
    const talkNod = mc.open * 0.05;
    const ent = this.entrance; const pop = ent < 1 ? 1 + Math.sin(ent * Math.PI) * 0.12 : 1;
    this.root.scale.setScalar(Math.max(0.0001, ent * pop));
    this.root.position.y = (1 - ent) * 1.2 + hop + Math.sin(this.t * 1.3) * 0.015 * c.bob;
    this.body.scale.set(1 + breath * 0.6 - hop * 0.3, 0.98 + breath + hop * 0.4, 0.94 + breath * 0.5);
    this.root.rotation.z = Math.sin(this.t * 0.9) * 0.025 + c.tilt * 0.35;
    this.root.rotation.x = c.lean * 0.6;
    this.root.rotation.y = Math.sin(this.t * 0.5) * 0.08 + c.turn;
    this.face.rotation.set(c.lean + c.nod + talkNod - c.lookY * 0.06, c.lookX * 0.12, c.tilt);

    // Piscar
    if (this.t > this.nextBlink) { this.blink = 1; this.nextBlink = this.t + 2.2 + Math.random() * 3.2; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkAmt = Math.sin(Math.min(1, 1 - this.blink) * Math.PI) * (this.blink > 0 ? 1 : 0);
    const lidClose = Math.min(1, Math.max(0, c.lid + blinkAmt * (1 - c.happy)));
    for (const e of this.eyes) {
      e.group.scale.setScalar(c.eyeScale);
      e.pupil.position.set(c.lookX * 0.11, c.lookY * 0.1, 0.15);
      const open = 1 - c.happy;
      e.pupil.scale.setScalar(Math.max(0.001, open));
      e.arc.scale.set(Math.max(0.001, c.happy), Math.max(0.001, c.happy) * 1.05, 0.6);
      e.lid.rotation.x = -Math.PI / 2 + lidClose * Math.PI * 0.98 + 0.02;
      e.lid.visible = lidClose > 0.02;
    }

    // Bico (visemas)
    this.beakLower.rotation.x = mc.open * 0.62;
    const lb = 0.82 + Math.min(1, mc.open * 3) * 0.18;
    this.beakLower.scale.set((1 + mc.wide * 0.25 - mc.round * 0.15) * lb, lb, lb);
    this.beakUpper.scale.set(1 + mc.wide * 0.12 - mc.round * 0.08, 1, 1);
    this.mouthIn.scale.set(1 + mc.wide * 0.4 - mc.round * 0.25, 0.01 + mc.open * 1.8, 0.5);
    this.mouthIn.visible = mc.open > 0.04;

    for (const ch of this.cheeks) ch.scale.set(1.2 * c.cheek, 0.8 * c.cheek, 0.4);
    this.tufts.forEach((tf, i) => { const side = i === 0 ? -1 : 1; tf.rotation.z = -side * (0.42 - c.tuft * 0.18) + Math.sin(this.t * 3 + i) * 0.02; });

    // Asas: aceno com o “pulso” e balanço leve
    for (const w of this.wings) {
      const raise = w.side === 1 ? c.wingR : c.wingL; const wave = w.side === 1 ? c.waveR : c.waveL;
      const flap = Math.sin(this.t * 9 + (w.side === 1 ? 0 : 1.4)) * 0.35 * wave;
      const sway = Math.sin(this.t * 2.1 + w.side) * 0.04;
      w.pivot.rotation.z = w.side * (raise + flap + sway);
      w.pivot.rotation.x = -raise * 0.12;
    }
    const sh = 1 - Math.min(0.25, this.root.position.y * 0.6);
    this.shadow.scale.set(sh * Math.max(0.01, ent), 1, sh * Math.max(0.01, ent));
  }

  dispose() {
    this.stop();
    for (const d of this.disposables) d.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}
