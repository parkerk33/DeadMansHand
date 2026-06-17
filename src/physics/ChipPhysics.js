import * as RAPIER from '@dimforge/rapier3d-compat';
import { FELT_TOP_Y } from '../room/Table.js';

// Contained physics for the POT chips only. Chips are PUSHED in: each spawns flat
// on the felt at its owner's bet spot and slides into the centre (one at a time, a
// sweep around the table), heaping into a natural, tightly-knit, uneven mound.
// Because they never go airborne, they can't land on an edge and roll away.
// Everything else stays hand-placed. Toggle via USE_CHIP_PHYSICS.
const POT = { x: 0, z: 0.45 };
const SPAWN_EVERY = 4;              // frames between chips → deliberate one-at-a-time sweep

export class ChipPhysics {
  constructor(scene) {
    this.scene = scene;
    this.ready = false;
    this.world = null;
    this.chips = [];          // { body, mesh }
    this.queue = [];          // { mesh, radius, halfHeight } awaiting spawn
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Felt surface (static): top at FELT_TOP_Y. Moderate friction so chips slide in
    // and then come to rest (too high and they'd stall before reaching the pot).
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(5, 0.5, 5).setTranslation(0, FELT_TOP_Y - 0.5, 0).setFriction(0.55),
    );

    // Table-edge rim (well away from the pot) so any chip that rolls out is caught
    // at the table edge instead of rolling off into the void. Far enough from the
    // central pile that it never causes chips to lean against it there.
    const RIM_R = 2.4, segs = 24;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.35, 0.25, 0.35)
          .setTranslation(Math.cos(a) * RIM_R, FELT_TOP_Y + 0.25, Math.sin(a) * RIM_R)
          .setFriction(0.3),
      );
    }
    this.ready = true;
  }

  // Queue a chip mesh (wrapper whose origin is the chip's bottom-centre) to slide
  // into the pot from its owner's bet spot (fromX, fromZ on the felt).
  queueChip(mesh, radius, halfHeight, fromX, fromZ) {
    this.queue.push({ mesh, radius, halfHeight, fromX, fromZ });
  }

  _spawnOne(item) {
    const { mesh, radius, halfHeight, fromX, fromZ } = item;
    // Aim from the bet spot toward the pot centre and give it a flat slide.
    const dx = POT.x - fromX, dz = POT.z - fromZ;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    const speed = 2.0 + dist * 2.4;          // enough to reach the pile and pack in
    const y = FELT_TOP_Y + 0.006;            // resting flat on the felt — never airborne
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(fromX, y, fromZ)
        .setLinvel(nx * speed, 0, nz * speed)
        .setAngvel({ x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 1.5, z: (Math.random() - 0.5) * 0.6 })
        .setLinearDamping(0.9)
        .setAngularDamping(2.5),              // a chip that does tip rolls only briefly, then falls
    );
    // Collider wraps the mesh (origin = bottom). Slightly thicker than the visual
    // for stable thin-disc contacts; no bounce.
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight + 0.004, radius)
        .setTranslation(0, halfHeight, 0).setFriction(0.5).setRestitution(0.0),
      body,
    );
    mesh.position.set(fromX, y, fromZ);
    this.scene.add(mesh);
    this.chips.push({ body, mesh });
  }

  step() {
    if (!this.ready) return;
    try {
      this._tick = (this._tick || 0) + 1;
      if (this.queue.length && this._tick % SPAWN_EVERY === 0) this._spawnOne(this.queue.shift());
      if (!this.chips.length) return;
      this.world.step();
      for (const c of this.chips) {
        const t = c.body.translation(), q = c.body.rotation();
        c.mesh.position.set(t.x, t.y, t.z);
        c.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
    } catch (e) {
      console.info('[physics] step failed, disabling:', e?.message || e);
      this.ready = false;            // ChipsView falls back to hand-animated collection
    }
  }

  hasChips() { return this.chips.length > 0 || this.queue.length > 0; }

  clear() {
    for (const c of this.chips) { this.scene.remove(c.mesh); this.world.removeRigidBody(c.body); }
    this.chips = [];
    this.queue = [];
  }
}
