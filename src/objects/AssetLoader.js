import * as THREE from 'three';
//import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { woodMaterial, brassMaterial, leatherMaterial, stoneMaterial, feltMaterial } from '../room/Materials.js';

// Loads Blender-exported .glb assets and (optionally) re-skins their meshes with
// the game's textured materials. Two ways to use it:
//
//   1. GEOMETRY-ONLY (recommended, no Blender baking needed):
//      Name your Blender *materials* with a role word — "wood", "brass", "felt",
//      "leather", "stone", "parchment". This loader swaps each mesh to the
//      matching textured material from Materials.js. The Blender look doesn't
//      matter; only the shapes come across.
//
//   2. FULLY BAKED PBR (advanced): if you baked textures in Blender, call
//      loadAsset(url, { reskin: false }) to keep the GLB's own materials.

const _loader = new GLTFLoader();
// Assets are compressed with EXT_meshopt_compression (gltf-transform), so the
// loader needs the meshopt decoder to read them.
_loader.setMeshoptDecoder(MeshoptDecoder);

// role keyword (matched against the GLB material name) -> game material
export function defaultSkins() {
  return {
    wood: woodMaterial({ rx: 3, ry: 1 }),
    brass: brassMaterial(),
    felt: feltMaterial(),
    leather: leatherMaterial(0x1a2452),
    stone: stoneMaterial(),
    parchment: new THREE.MeshStandardMaterial({ color: 0xefe2c0, roughness: 0.55 }),
  };
}

export function loadGLB(url) {
  return new Promise((resolve, reject) => {
    _loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Load a .glb and return its root Object3D.
 * @param {string} url            e.g. '/assets/table.glb'
 * @param {object} opts
 * @param {boolean} opts.reskin   replace materials by role keyword (default true)
 * @param {object}  opts.skins    role -> THREE.Material map (default defaultSkins())
 * @param {number}  opts.scale    uniform scale applied to the root (default 1)
 */
export async function loadAsset(url, { reskin = true, skins = null, scale = 1 } = {}) {
  const root = await loadGLB(url);
  const palette = skins || defaultSkins();
  root.scale.setScalar(scale);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (!reskin) return;
    const matName = (o.material && o.material.name ? o.material.name : o.name).toLowerCase();
    for (const role of Object.keys(palette)) {
      if (matName.includes(role)) { o.material = palette[role]; break; }
    }
  });
  return root;
}

/**
 * Try to load a GLB; if it's missing (not exported yet) resolve to null so the
 * caller can fall back to procedural geometry without crashing.
 */
export async function tryLoadAsset(url, opts) {
  try {
    return await loadAsset(url, opts);
  } catch (err) {
    console.info(`[assets] ${url} not loaded (${err?.message || err}); using procedural fallback.`);
    return null;
  }
}
