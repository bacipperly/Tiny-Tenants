import * as THREE from 'three';
import { GridModel } from '../grid/gridModel';
import { cellToWorld, CELL_SIZE } from '../grid/gridMath';

const ROOM_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x51cf66, 0xcc5de8, 0xff922b, 0x22b8cf, 0xf783ac];

/** Tints every cell of each detected room, floor or no floor, so room detection can be checked by eye. */
export class RoomOverlay {
  readonly group = new THREE.Group();
  private geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
  private materials = ROOM_COLORS.map(
    (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }),
  );

  rebuild(model: GridModel) {
    this.group.clear();
    if (!this.group.visible) return;
    for (const room of model.allRooms()) {
      const material = this.materials[(room.id - 1) % this.materials.length];
      for (const cell of room.cells) {
        const mesh = new THREE.Mesh(this.geo, material);
        const pos = cellToWorld(cell.x, cell.z);
        mesh.position.set(pos.x, 0.08, pos.z);
        mesh.rotation.x = -Math.PI / 2;
        this.group.add(mesh);
      }
    }
  }

  setVisible(visible: boolean, model: GridModel) {
    this.group.visible = visible;
    this.rebuild(model);
  }
}
