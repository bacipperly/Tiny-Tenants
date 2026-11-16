import * as THREE from 'three';

/**
 * Frees the graphics memory behind everything under `root`: the shapes and
 * materials it was drawn with. Builders that throw their meshes away and make
 * new ones on every change have to call this first, or each rebuild leaves the
 * old ones on the graphics card and the game slows down the longer you play.
 * Anything in `keep` is shared with what gets built next, so it stays.
 * Textures are left alone: they're all shared.
 */
export function disposeTree(root: THREE.Object3D, keep: ReadonlySet<object> = new Set()) {
  root.traverse((object) => {
    const { geometry, material } = object as THREE.Mesh;
    // Every sprite shares one shape that three.js owns.
    if (geometry && !(object instanceof THREE.Sprite) && !keep.has(geometry)) geometry.dispose();
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const each of materials) if (!keep.has(each)) each.dispose();
    if (object instanceof THREE.InstancedMesh && !keep.has(object)) object.dispose();
  });
}
