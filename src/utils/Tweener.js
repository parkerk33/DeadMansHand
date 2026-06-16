import * as THREE from 'three';

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function easeOutBack(t) { const c1=1.70158, c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }

const EASINGS = { easeOutCubic, easeInOutCubic, easeOutBack, linear: t=>t };

export class Tweener {
  constructor() { this._tweens = []; }

  to(target, props, duration, easing = 'easeOutCubic', onComplete = null) {
    const from = {};
    for (const key in props) {
      const v = target[key];
      if (v instanceof THREE.Vector3) from[key] = v.clone();
      else if (v instanceof THREE.Euler) from[key] = { x:v.x, y:v.y, z:v.z };
      else from[key] = v;
    }
    this._tweens.push({ target, from, props, duration, elapsed: 0, easing, onComplete, done: false });
  }

  update(deltaMs) {
    const delta = Math.min(deltaMs / 1000, 0.05); // cap at 50ms

    // Take the current batch and reset the live list. onComplete callbacks often
    // chain a NEW tween (e.g. card lift -> drop); those pushes land in the fresh
    // this._tweens and must survive, so we re-append survivors afterwards.
    const batch = this._tweens;
    this._tweens = [];
    const survivors = [];

    for (const t of batch) {
      if (t.done) continue;
      t.elapsed += delta;
      const progress = Math.min(t.elapsed / t.duration, 1);
      const ease = (EASINGS[t.easing] || easeOutCubic)(progress);

      for (const key in t.props) {
        const s = t.from[key], e = t.props[key];
        if (s instanceof THREE.Vector3) {
          t.target[key].lerpVectors(s, e, ease);
        } else if (typeof s === 'object' && s !== null) {
          for (const ax in s) t.target[key][ax] = s[ax] + (e[ax] - s[ax]) * ease;
        } else {
          t.target[key] = s + (e - s) * ease;
        }
      }

      if (progress >= 1) {
        t.done = true;
        t.onComplete?.();      // may push a chained tween into this._tweens
      } else {
        survivors.push(t);
      }
    }

    // Keep still-running tweens plus any chained ones added during this tick.
    if (survivors.length) this._tweens = survivors.concat(this._tweens);
  }

  clear() { this._tweens = []; }
}
