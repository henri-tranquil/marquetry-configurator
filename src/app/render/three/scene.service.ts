import { DestroyRef, inject, Injectable, NgZone, signal } from '@angular/core';
import {
  AmbientLight,
  CanvasTexture,
  ClampToEdgeWrapping,
  ColorManagement,
  DirectionalLight,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshLambertMaterial,
  NoColorSpace,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Prepared, RAD } from '../../core/geometry/geometry';
import { Project, WOOD_HEX, Zone } from '../../core/model/project';
import { createFiberTexture } from '../straw-2d.renderer';
import { buildPanelGeometry, HolePlan, planHoles } from './panel-geometry';
import { buildStrawMaps, StrawMaps } from './straw-maps';
import { createStrawMaterial, glossUniforms } from './straw.material';

export type SceneStatus = 'idle' | 'ok' | 'error';

interface SceneInput {
  project: Project;
  prepared: Prepared;
  selected: Zone | null;
}

const REBUILD_DEBOUNCE = 140;

/**
 * Vue 3D. Tourne hors de la zone Angular ; à fournir au niveau du composant
 * pour que DestroyRef libère géométrie, textures et renderer.
 */
@Injectable()
export class SceneService {
  private readonly zone = inject(NgZone);
  readonly status = signal<SceneStatus>('idle');

  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.01, 50);
  private readonly material = createStrawMaterial();
  private readonly sideMaterial = new MeshLambertMaterial({ color: WOOD_HEX, side: DoubleSide });
  private readonly sun = new DirectionalLight(0xffffff, 0.85 * Math.PI);
  private readonly fiber = createFiberTexture();
  private mesh: Mesh | null = null;
  private maps: StrawMaps | undefined;

  private canvas: HTMLCanvasElement | null = null;
  private input: SceneInput | null = null;
  private key = '';
  private rebuildTimer = 0;
  private raf = 0;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cleanups: (() => void)[] = [];

  /* caméra orbitale */
  private yaw = -0.5;
  private pitch = 0.18;
  private zoom = 1;
  private readonly pointers = new Map<number, [number, number]>();
  private pinch = 0;

  constructor() {
    ColorManagement.enabled = true;
    // intensités physiques (r155+) : × π pour retrouver l'éclairage du prototype
    this.scene.add(this.sun, new AmbientLight(0xffffff, 0.5 * Math.PI));
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  attach(canvas: HTMLCanvasElement): void {
    this.zone.runOutsideAngular(() => {
      try {
        this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch {
        this.status.set('error');
        return;
      }
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.canvas = canvas;
      this.status.set('ok');
      this.bindPointer(canvas);
      this.resizeObserver = new ResizeObserver(() => this.schedule());
      this.resizeObserver.observe(canvas);
      this.schedule();
    });
  }

  update(input: SceneInput): void {
    this.input = input;
    this.schedule();
  }

  resetCamera(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 1;
    this.schedule();
  }

  private schedule(): void {
    if (this.raf || !this.renderer) return;
    this.zone.runOutsideAngular(() => {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.frame();
      });
    });
  }

  private frame(): void {
    const r = this.renderer;
    const c = this.canvas;
    const inp = this.input;
    if (!r || !c || !inp) return;
    const p = inp.project;

    // textures et géométrie : seulement si la clé change, avec un debounce
    const key = JSON.stringify([p.panel, p.bg, p.sw, p.irr, p.zones, p.thick, p.edge]);
    if (key !== this.key) {
      if (!this.mesh) {
        this.key = key;
        this.rebuild(p, inp.prepared);
      } else {
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = window.setTimeout(() => {
          const cur = this.input;
          if (!cur) return;
          this.key = key;
          this.rebuild(cur.project, cur.prepared);
          this.schedule();
        }, REBUILD_DEBOUNCE);
      }
    }

    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    const pr = Math.min(2, window.devicePixelRatio || 1);
    if (r.getPixelRatio() !== pr) r.setPixelRatio(pr);
    if (W !== this.width || H !== this.height) {
      this.width = W;
      this.height = H;
      r.setSize(W, H, false);
    }

    const { w, h } = p.panel;
    const big = Math.max(w, h);
    const asp = W / H;
    const half = Math.tan(16 * RAD);
    const fit = ((Math.max(h / big, w / big / asp) * 0.5) / half) * 1.18 * this.zoom;
    this.camera.aspect = asp;
    this.camera.updateProjectionMatrix();
    // la caméra vise la forme sélectionnée (repère three : y vers le haut)
    const s = inp.selected;
    const tx = s ? (s.x - w / 2) / big : 0;
    const ty = s ? (h / 2 - s.y) / big : 0;
    this.camera.position.set(
      tx + fit * Math.sin(this.yaw) * Math.cos(this.pitch),
      ty + fit * Math.sin(this.pitch),
      fit * Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.camera.lookAt(tx, ty, 0);

    const a = p.light * RAD;
    const e = p.elev * RAD;
    const L = new Vector3(Math.cos(a) * Math.cos(e), -Math.sin(a) * Math.cos(e), Math.sin(e));
    const u = this.material.uniforms;
    u.uL.value.copy(L);
    this.sun.position.copy(L);
    u.uCam.value.copy(this.camera.position);
    const g = glossUniforms(p.gloss, p.contrast);
    u.uGloss.value = g.gloss;
    u.uSpec.value = g.spec;
    r.render(this.scene, this.camera);
  }

  private rebuild(p: Project, D: Prepared): void {
    let plan: HolePlan = planHoles(p, D);
    let geometry;
    try {
      geometry = buildPanelGeometry(p, plan);
    } catch {
      // triangulation cassée : repli sans profil ni perçage, trous découpés par la texture
      plan = { rO: 0, drilled: [] };
      geometry = buildPanelGeometry(p, plan);
    }
    const drilled = new Set(plan.drilled.map((d) => d.hole.zone.id));
    this.maps = buildStrawMaps(p, D, this.fiber, drilled, this.maps);
    const u = this.material.uniforms;
    u.uAlb.value = this.replaceTexture(u.uAlb.value, this.maps.albedo, true);
    u.uDir.value = this.replaceTexture(u.uDir.value, this.maps.direction, false);

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new Mesh(geometry, [this.material, this.sideMaterial]);
    this.mesh.scale.setScalar(1 / Math.max(p.panel.w, p.panel.h));
    this.scene.add(this.mesh);
  }

  private replaceTexture(old: Texture | null, canvas: HTMLCanvasElement, albedo: boolean): Texture {
    old?.dispose();
    const t = new CanvasTexture(canvas);
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    if (albedo) {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = this.renderer?.capabilities.getMaxAnisotropy() ?? 1;
    } else {
      // directions : donnée brute, pas de mipmaps (elles se moyenneraient n'importe comment)
      t.colorSpace = NoColorSpace;
      t.generateMipmaps = false;
      t.minFilter = LinearFilter;
      t.magFilter = LinearFilter;
    }
    return t;
  }

  private bindPointer(c: HTMLCanvasElement): void {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      c.addEventListener(type, fn, opts);
      this.cleanups.push(() => c.removeEventListener(type, fn, opts));
    };
    on('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.pinch = 0;
    });
    on('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      if (this.pointers.size === 1) {
        this.yaw = Math.max(-1.45, Math.min(1.45, this.yaw - (e.clientX - prev[0]) * 0.005));
        this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - prev[1]) * 0.004));
      }
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [[number, number], [number, number]];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this.pinch) this.zoom = Math.max(0.04, Math.min(3, (this.zoom * this.pinch) / d));
        this.pinch = d;
      }
      this.schedule();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = 0;
    };
    on('pointerup', up);
    on('pointercancel', up);
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.04, Math.min(3, this.zoom * Math.exp(e.deltaY * 0.0012)));
        this.schedule();
      },
      { passive: false },
    );
    on('dblclick', () => this.resetCamera());
  }

  private dispose(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.rebuildTimer);
    this.resizeObserver?.disconnect();
    for (const f of this.cleanups) f();
    this.mesh?.geometry.dispose();
    this.material.uniforms.uAlb.value?.dispose();
    this.material.uniforms.uDir.value?.dispose();
    this.material.dispose();
    this.sideMaterial.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.mesh = null;
  }
}
