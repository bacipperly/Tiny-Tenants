import * as THREE from 'three';
import type { GridModel } from '../grid/gridModel';
import { cellToWorld, worldToCell } from '../grid/gridMath';
import { getFootprintCenterOffset, getFurnitureDef, isLit, restingHeight } from './furnitureCatalog';
import { hiddenWith } from './furniturePlacer';
import type { FurniturePiece } from '../grid/gridModel';
import type { LightSource } from './furnitureCatalog';
import { lightAt } from './roomLighting';
import type { RoomLight } from './roomLighting';

/** Real lights are costly to draw, so past this many, the rest only get their glow on the floor. */
export const MAX_REAL_LIGHTS = 10;
/** How far a light reaches, compared to its pool on the floor. */
const LIGHT_REACH_PER_POOL = 1.8;
/** Just above a rug, so the pool shows on one too. */
const POOL_HEIGHT_ON_FLOOR = 0.085;
const POOL_HEIGHT_ON_GRASS = 0.005;
/** How strong the pool is in a sunny room, and how much stronger in the darkest one. */
const POOL_OPACITY_IN_DAYLIGHT = 0.22;
const POOL_OPACITY_EXTRA_IN_DARK = 0.5;
const HALO_OPACITY = 0.55;
/** How hard lamps near each other hold back, so a cluster is brighter than one lamp but nowhere near all of them added up. */
const CROWD_DAMPING = 1;

let glowTexture: THREE.CanvasTexture | null = null;

/** A soft round glow, bright in the middle and fading to nothing at the edge. */
function glow(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

interface PlacedLight {
  pieceId: string;
  source: LightSource;
  light: THREE.PointLight | null;
  pool: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  poolOpacity: number;
  /** How much of its own light it gives, after sharing with lamps around it. */
  share: number;
  phase: number;
}

/**
 * The light that lamps and fireplaces give off: a real light that brightens
 * the walls, furniture and pawns around it, a warm pool on the floor, and a
 * soft halo around the bulb or the flames. A fire's light flickers with it.
 */
export class FurnitureLights {
  readonly group = new THREE.Group();
  private placed: PlacedLight[] = [];
  private hiddenId: string | null = null;
  private allPieces: FurniturePiece[] = [];

  /** `realLights` is how many of its lamps may be real lights. The rest only glow, on the floor and around the bulb. */
  rebuild(model: GridModel, roomLight: RoomLight, realLights = MAX_REAL_LIGHTS) {
    for (const { pool, halo } of this.placed) {
      pool.geometry.dispose();
      pool.material.dispose();
      halo.material.dispose();
    }
    this.group.clear();
    this.placed = [];
    let placedLights = 0;
    this.allPieces = model.allFurniture();
    const sources = this.allPieces.flatMap((piece) => {
      const source = getFurnitureDef(piece.type).light;
      // A fire that's out gives no light.
      if (!source || !isLit(piece)) return [];
      // Where the light is, turned the way the piece is.
      const offset = getFootprintCenterOffset(piece.type, piece.rotation);
      const center = cellToWorld(piece.x + offset.dx, piece.z + offset.dz);
      const angle = THREE.MathUtils.degToRad(piece.rotation);
      const [x, y, z] = source.at;
      // A lamp set on a table shines from that much higher up.
      const lift = restingHeight(piece, this.allPieces);
      const position = new THREE.Vector3(center.x + x * Math.cos(angle) + z * Math.sin(angle), y + lift, center.z - x * Math.sin(angle) + z * Math.cos(angle));
      const home = worldToCell(position.x, position.z);
      return [{ piece, source, position, room: model.roomIdAt(home.x, home.z) }];
    });
    for (const { piece, source, position, room } of sources) {
      const share = lightShare(source, position, room, sources);

      let light: THREE.PointLight | null = null;
      if (placedLights < realLights) {
        placedLights++;
        light = new THREE.PointLight(source.color, source.strength * share, source.pool * LIGHT_REACH_PER_POOL, 2);
        light.position.copy(position);
        this.group.add(light);
      }

      const brightness = lightAt(roomLight, model, piece);
      const poolOpacity = (POOL_OPACITY_IN_DAYLIGHT + POOL_OPACITY_EXTRA_IN_DARK * (1 - brightness)) * share;
      const pool = new THREE.Mesh(
        poolGeometry(model, position, source.pool),
        new THREE.MeshBasicMaterial({ map: glow(), color: source.color, transparent: true, opacity: poolOpacity, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.group.add(pool);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: source.color, transparent: true, opacity: HALO_OPACITY * Math.sqrt(share), blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(position);
      halo.scale.setScalar(source.halo);
      this.group.add(halo);

      this.placed.push({ pieceId: piece.id, source, light, pool, halo, poolOpacity, share, phase: piece.x * 1.3 + piece.z * 2.1 });
    }
    this.setHidden(this.hiddenId);
  }

  /** A lamp in the hand doesn't light up the spot it was picked up from. */
  setHidden(id: string | null) {
    this.hiddenId = id;
    const hidden = hiddenWith(id, this.allPieces);
    for (const { pieceId, light, pool, halo } of this.placed) {
      const visible = !hidden.has(pieceId);
      if (light) light.visible = visible;
      pool.visible = visible;
      halo.visible = visible;
    }
  }

  /** Call every frame with the time in seconds, so a fire's light dances. */
  animate(time: number) {
    for (const { source, light, pool, halo, poolOpacity, share, phase } of this.placed) {
      if (!source.flicker) continue;
      const t = time + phase;
      const flicker = 1 + 0.16 * Math.sin(t * 9.3) + 0.09 * Math.sin(t * 23.1) + 0.06 * Math.sin(t * 4.7);
      if (light) light.intensity = source.strength * share * flicker;
      pool.material.opacity = poolOpacity * flicker;
      halo.material.opacity = HALO_OPACITY * Math.sqrt(share) * flicker;
      halo.scale.setScalar(source.halo * (0.94 + 0.06 * flicker));
    }
  }
}

/**
 * How much of its light a lamp gives, from 1 on its own down toward a small
 * part of it in a crowd. Each lamp in the same room whose light overlaps this
 * one's counts for more the closer it is, so two lamps a step apart are only a
 * little brighter than one, and a whole cluster still doesn't blow out.
 */
function lightShare(
  source: LightSource,
  position: THREE.Vector3,
  room: number | null,
  all: readonly { source: LightSource; position: THREE.Vector3; room: number | null }[],
): number {
  let crowd = 0;
  for (const other of all) {
    if (other.position === position || other.room !== room) continue;
    const distance = Math.hypot(other.position.x - position.x, other.position.z - position.z);
    const overlap = Math.max(0, 1 - distance / (source.pool + other.source.pool));
    crowd += overlap * overlap;
  }
  return 1 / (1 + CROWD_DAMPING * crowd);
}

/**
 * The squares the pool covers: those within its radius and in the same room
 * as the light, so it stops at the walls instead of spilling into the next
 * room. The glow is laid across them as one picture, centered on the light.
 */
function poolGeometry(model: GridModel, lightAtPosition: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const home = worldToCell(lightAtPosition.x, lightAtPosition.z);
  const room = model.roomIdAt(home.x, home.z);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const reach = Math.ceil(radius);
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const cell = { x: home.x + dx, z: home.z + dz };
      if (model.roomIdAt(cell.x, cell.z) !== room) continue;
      const middle = cellToWorld(cell.x, cell.z);
      if (Math.hypot(middle.x - lightAtPosition.x, middle.z - lightAtPosition.z) > radius + 0.75) continue;
      const y = model.hasFloor(cell.x, cell.z) ? POOL_HEIGHT_ON_FLOOR : POOL_HEIGHT_ON_GRASS;
      const first = positions.length / 3;
      for (const [cornerX, cornerZ] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        const x = middle.x + cornerX;
        const z = middle.z + cornerZ;
        positions.push(x, y, z);
        uvs.push((x - lightAtPosition.x) / (radius * 2) + 0.5, (z - lightAtPosition.z) / (radius * 2) + 0.5);
      }
      // Wound to face up.
      indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
