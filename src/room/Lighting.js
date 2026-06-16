import * as THREE from 'three';
import { candlePositions } from './Table.js';

export function setupLighting(scene) {
  // Soft sky ambient so nothing is ever pitch black
  const ambient = new THREE.AmbientLight(0xbcd0e8, 0.5);
  scene.add(ambient);

  // Hemisphere: cool sky above, warm wood/stone bounce below (kept low for contrast)
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x4a3320, 0.5);
  scene.add(hemi);

  // Cool daylight pouring in from the open balcony (the -z / ocean side)
  const keyLight = new THREE.DirectionalLight(0xdCEBFF, 1.35);
  keyLight.position.set(-4, 13, -12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.camera.left = -14;
  keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 16;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight);

  // Warm chandelier glow directly over the felt — the focal pool of light
  const chandelier = new THREE.PointLight(0xffb45c, 3.2, 15, 1.5);
  chandelier.position.set(0, 4.4, 0);
  chandelier.castShadow = true;
  chandelier.shadow.mapSize.set(1024, 1024);
  chandelier.shadow.bias = -0.001;
  scene.add(chandelier);

  // Table candles — small warm point lights at each holder
  const candleLights = [];
  for (const p of candlePositions()) {
    const light = new THREE.PointLight(0xff9038, 0.7, 3.4, 2);
    light.position.set(p.x, p.y + 0.2, p.z);
    scene.add(light);
    candleLights.push(light);
  }

  // Warm wall lanterns in the corners
  const lanternLights = [];
  for (const pos of [[-6.4, 3.4, -6.4], [6.4, 3.4, -6.4], [-6.4, 3.4, 6.0], [6.4, 3.4, 6.0]]) {
    const light = new THREE.PointLight(0xffa040, 0.9, 9, 2);
    light.position.set(...pos);
    scene.add(light);
    lanternLights.push(light);
  }

  return { ambient, hemi, keyLight, chandelier, candleLights, lanternLights };
}

export function animateLights(lights, time) {
  lights.candleLights.forEach((light, i) => {
    const flicker = 1 + Math.sin(time * 3.6 + i * 1.4) * 0.16 +
                        Math.sin(time * 7.4 + i * 0.9) * 0.08;
    light.intensity = 0.7 * flicker;
  });
  if (lights.chandelier) {
    lights.chandelier.intensity = 3.2 + Math.sin(time * 2.1) * 0.14;
  }
}
