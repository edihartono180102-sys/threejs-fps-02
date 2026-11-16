// Transient combat effects for Emberworks: tracers, muzzle flashes, impact
// sparks and explosions. Everything is pooled and reused — the hot loop never
// allocates a mesh — and every effect carries its own clock, so the fixed
// step can advance them without touching the renderer.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 8;
const SPARK_POINTS = 26;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPositions = new Float32Array(MAX_TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    tracers.push({ life: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
  }
  let tracerCursor = 0;

  const flash = new THREE.PointLight(0xffc06a, 0, 9, 2);
  scene.add(flash);
  let flashLife = 0;

  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.09, transparent: true, opacity: 0 }));
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, velocities: new Float32Array(SPARK_POINTS * 3) });
  }
  let sparkCursor = 0;

  const explosionLight = new THREE.PointLight(0xff7a1a, 0, 26, 1.6);
  scene.add(explosionLight);
  let explosionLife = 0;
  let explosionPos = new THREE.Vector3();

  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
  );
  scene.add(flashMesh);

  function rewriteTracers() {
    for (let i = 0; i < MAX_TRACERS; i += 1) {
      const t = tracers[i];
      const base = i * 6;
      if (t.life > 0) {
        tracerPositions[base] = t.from.x;
        tracerPositions[base + 1] = t.from.y;
        tracerPositions[base + 2] = t.from.z;
        tracerPositions[base + 3] = t.to.x;
        tracerPositions[base + 4] = t.to.y;
        tracerPositions[base + 5] = t.to.z;
      } else {
        tracerPositions[base] = 0;
        tracerPositions[base + 1] = -10;
        tracerPositions[base + 2] = 0;
        tracerPositions[base + 3] = 0;
        tracerPositions[base + 4] = -10;
        tracerPositions[base + 5] = 0;
      }
    }
    tracerGeo.attributes.position.needsUpdate = true;
  }

  return {
    tracer(from, to) {
      const t = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      t.from.copy(from);
      t.to.copy(to);
      t.life = 0.07;
      rewriteTracers();
    },
    muzzle(position) {
      flash.position.copy(position);
      flash.intensity = 26;
      flashLife = 0.06;
      flashMesh.position.copy(position);
      flashMesh.material.opacity = 0.95;
    },
    impact(point, normal) {
      const s = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      const attr = s.points.geometry.attributes.position;
      for (let i = 0; i < SPARK_POINTS; i += 1) {
        attr.array[i * 3] = point.x;
        attr.array[i * 3 + 1] = point.y;
        attr.array[i * 3 + 2] = point.z;
        const vx = (Math.random() * 2 - 1) * 2.4 + normal.x * 2;
        const vy = Math.random() * 2.4 + 1.2 + normal.y * 2;
        const vz = (Math.random() * 2 - 1) * 2.4 + normal.z * 2;
        s.velocities[i * 3] = vx;
        s.velocities[i * 3 + 1] = vy;
        s.velocities[i * 3 + 2] = vz;
      }
      attr.needsUpdate = true;
      s.life = 0.45;
      s.points.material.opacity = 1;
    },
    explosion(point) {
      explosionPos.copy(point);
      explosionLight.position.copy(point);
      explosionLight.position.y = point.y + 0.8;
      explosionLight.intensity = 120;
      explosionLife = 0.55;
      this.impact(point, new THREE.Vector3(0, 1, 0));
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          if (t.life <= 0) rewriteTracers();
        }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) {
          flash.intensity = 0;
          flashMesh.material.opacity = 0;
        }
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        const attr = s.points.geometry.attributes.position;
        for (let i = 0; i < SPARK_POINTS; i += 1) {
          attr.array[i * 3] += s.velocities[i * 3] * dt;
          attr.array[i * 3 + 1] += s.velocities[i * 3 + 1] * dt;
          attr.array[i * 3 + 2] += s.velocities[i * 3 + 2] * dt;
          s.velocities[i * 3 + 1] -= 9 * dt;
          if (attr.array[i * 3 + 1] < 0.03) attr.array[i * 3 + 1] = 0.03;
        }
        attr.needsUpdate = true;
        s.points.material.opacity = Math.max(0, s.life / 0.45);
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        explosionLight.intensity = Math.max(0, explosionLife / 0.55) * 120;
      }
    },
  };
}
