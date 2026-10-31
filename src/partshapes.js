// Line drawings of individual parts for the exploded view (metres, part centred on its anchor).
// [Assumption] Shapes are schematic: enough to tell a wheel from a tray, not engineering geometry.
import * as THREE from 'three';

const edges = (g, deg = 25) => new THREE.EdgesGeometry(g, deg);
const at = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const box = (x, y, z, ...p) => at(edges(new THREE.BoxGeometry(x, y, z)), ...p);
const cyl = (r, h, n, ...p) => at(edges(new THREE.CylinderGeometry(r, r, h, n), 30), ...p);
const ring = (r, n, ...p) => at(edges(new THREE.CylinderGeometry(r, r, .001, n), 30), ...p);
const poly = pts => { const g = new THREE.BufferGeometry(), a = []; for (let i = 0; i < pts.length - 1; i++) a.push(...pts[i], ...pts[i + 1]); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return g; };
const curve = (pts, n = 40) => poly(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))).getPoints(n).map(v => v.toArray()));
const H = Math.PI / 2;

// size: [x, y, z] from the scene's size table
export function partShape(k, [sx, sy, sz]) {
  switch (k) {
    case 'wheel': { const r = sx / 2, w = sz, o = [cyl(r, w, 40, 0, 0, 0, H), cyl(r * .72, w * .6, 40, 0, 0, 0, H), cyl(r * .14, w * .8, 12, 0, 0, 0, H)];
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; o.push(poly([[Math.cos(a) * r * .16, Math.sin(a) * r * .16, w * .3], [Math.cos(a + .12) * r * .7, Math.sin(a + .12) * r * .7, w * .3]]),
        poly([[Math.cos(a) * r * .16, Math.sin(a) * r * .16, w * .3], [Math.cos(a - .12) * r * .7, Math.sin(a - .12) * r * .7, w * .3]])); } return o; }
    case 'housing': return [cyl(sy / 2, sx * .8, 28, 0, 0, 0, 0, 0, H), box(sx * .14, sy * 1.15, sz * 1.15, sx * .42), ring(sy * .3, 20, -sx * .42, 0, 0, 0, 0, H),
      ...[0, 1, 2, 3, 4, 5].map(i => box(sx * .7, .012, .02, 0, Math.cos(i) * sy * .5, Math.sin(i) * sy * .5))];
    case 'tray': { const o = [box(sx, sy, sz)]; for (const f of [-1 / 6, 1 / 6]) o.push(box(.01, sy, sz, sx * f));
      for (const f of [-.25, .25]) o.push(box(sx, sy, .01, 0, 0, sz * f)); return o; }
    case 'seat': return [box(sx, sy * .22, sz, 0, -sy * .3), box(sx * .22, sy * .75, sz, -sx * .4, sy * .15), box(sx * .2, sy * .14, sz * .7, -sx * .4, sy * .55),
      ...[-1, 1].map(s => box(sx * 1.1, .03, .04, 0, -sy * .45, s * sz * .35))];
    case 'subframe': return [box(sx, sy, .1, 0, 0, sz / 2 - .05), box(sx, sy, .1, 0, 0, -sz / 2 + .05), box(.1, sy, sz, sx / 2 - .05), box(.1, sy, sz, -sx / 2 + .05),
      ...[-1, 1].map(s => cyl(.07, sy * 1.6, 12, s * sx / 2, 0, s * sz / 2))];
    case 'door': return [box(sx, sy, sz), box(sx * .75, sy * .45, sz * 1.1, sx * .05, sy * .72), box(sx * .2, .03, .05, sx * .2, sy * .25, sz / 2)];
    case 'harness': return [-.04, 0, .04].map(d => curve([[-sx / 2, 0, -sz / 2 + d], [-sx / 4, 0, sz / 4 + d], [0, 0, -sz / 4 + d], [sx / 4, 0, sz / 3 + d], [sx / 2, 0, -sz / 2 + d]]))
      .concat([0, 1, 2, 3].map(i => box(.08, .05, .08, -sx / 2 + i * sx / 3, 0, (i % 2 ? .2 : -.2) * sz)));
    case 'crash': return [box(sx, sy, sz), ...[-1, 1].map(s => box(sx * 1.8, sy * .9, sy * .9, -sx * .9, 0, s * sz * .38)), box(sx * .5, sy * 1.2, sz * .9, sx * .1)];
    case 'bumper': return [curve([[0, sy / 2, -sz / 2], [sx, sy / 2, 0], [0, sy / 2, sz / 2]]), curve([[0, -sy / 2, -sz / 2], [sx, -sy / 2, 0], [0, -sy / 2, sz / 2]]),
      ...[-.5, -.25, 0, .25, .5].map(f => poly([[sx * (1 - 4 * f * f), sy / 2, sz * f], [sx * (1 - 4 * f * f), -sy / 2, sz * f]])), box(.02, sy * .4, sz * .4, sx, -sy * .1)];
    case 'screen': case 'ecu': return [box(sx, sy, sz), box(sx * .9, sy * .82, .005, 0, 0, sz / 2 + .002), ...[0, 1, 2].map(i => box(.02, .015, .02, -sx * .3 + i * sx * .3, -sy / 2 - .01, 0))];
    case 'glass': case 'cover': case 'tailgate': return [box(sx, sy, sz), box(sx * 1.01, sy * .8, sz * .85)];
    case 'bracket': return [box(sx, sy * .2, sz, 0, -sy * .4), box(sx * .2, sy, sz, -sx * .4), poly([[-sx * .3, -sy * .3, sz / 2], [sx * .4, -sy * .3, sz / 2], [-sx * .3, sy * .4, sz / 2], [-sx * .3, -sy * .3, sz / 2]]),
      poly([[-sx * .3, -sy * .3, -sz / 2], [sx * .4, -sy * .3, -sz / 2], [-sx * .3, sy * .4, -sz / 2], [-sx * .3, -sy * .3, -sz / 2]]), ring(sz * .25, 16, sx * .25, -sy * .3, 0, H), ring(sz * .25, 16, -sx * .4, sy * .2, 0, 0, 0, H)];
    case 'brake': return [cyl(sx / 2, sz, 40, 0, 0, 0, H), cyl(sx * .2, sz * 1.6, 20, 0, 0, 0, H), box(sx * .3, sy * .35, sz * 2.4, sx * .32, sx * .2)];
    case 'ccb': return [cyl(sx / 2, sz, 14, 0, 0, 0, H), ...[-.3, 0, .3].map(f => box(sx * 1.4, sx * 3, sx * .8, 0, -sx * 1.5, sz * f))];
    case 'ip': return [curve([[0, sy / 2, -sz / 2], [-sx * .6, sy * .4, 0], [0, sy / 2, sz / 2]]), curve([[sx / 2, -sy / 2, -sz / 2], [0, -sy / 2, 0], [sx / 2, -sy / 2, sz / 2]]), box(sx * .5, sy * .5, sz * .25, 0, 0, sz * .2)];
    case 'lamp': return [box(sx, sy, sz), box(sx * .2, sy * .7, sz * .4, sx / 2, 0, -sz * .2), ring(sy * .3, 20, sx / 2 + .005, 0, sz * .22, 0, 0, H)];
    case 'battery': { const o = [box(sx, sy, sz)]; for (const f of [-.25, 0, .25]) o.push(box(.01, sy, sz, sx * f)); return o; }
    default: return [box(sx, sy, sz)];
  }
}
