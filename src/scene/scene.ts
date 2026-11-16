import * as THREE from 'three';
import { createGrassTexture, GRASS_TILE_CELLS } from './grassTexture';
import { LOT_MAX_CELL, LOT_MIN_CELL } from '../grid/gridMath';
import { skipPools } from '../build/poolBuilder';

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a8f, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 10, 4);
  sun.castShadow = false;
  scene.add(sun);

  const groundSize = 1000;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  const grass = createGrassTexture();
  grass.repeat.setScalar(groundSize / GRASS_TILE_CELLS);
  const groundMat = new THREE.MeshStandardMaterial({ map: grass });
  // Open where a pool is dug.
  skipPools(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
  scene.add(createLotBoundary());

  return scene;
}

/** A thin line around the lot, with slightly darker grass beyond it. */
function createLotBoundary(): THREE.Group {
  const lotMin = LOT_MIN_CELL - 0.5;
  const lotMax = LOT_MAX_CELL + 0.5;
  const lineWidth = 0.08;
  const outerEdge = 500;

  const square = (min: number, max: number) => {
    const path = new THREE.Path();
    path.moveTo(min, min);
    path.lineTo(max, min);
    path.lineTo(max, max);
    path.lineTo(min, max);
    path.closePath();
    return path;
  };
  const squareWithHole = (min: number, max: number, holeMin: number, holeMax: number) => {
    const shape = new THREE.Shape(square(min, max).getPoints());
    shape.holes.push(square(holeMin, holeMax));
    return new THREE.ShapeGeometry(shape);
  };
  const flatMesh = (geometry: THREE.BufferGeometry, color: number, opacity: number, y: number) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  };

  const group = new THREE.Group();
  group.add(flatMesh(squareWithHole(-outerEdge, outerEdge, lotMin, lotMax), 0x1f3d1a, 0.14, -0.008));
  group.add(flatMesh(squareWithHole(lotMin - lineWidth, lotMax + lineWidth, lotMin, lotMax), 0xf4f7e8, 0.55, -0.007));
  return group;
}
