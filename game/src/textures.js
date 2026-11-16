// Procedural canvas textures for Emberworks. No image files ship with the game:
// every surface is painted once at boot from a small seeded canvas, then reused
// as a repeating map. Keeping the palette to a few dusk-industrial tones makes
// the yard read at a glance: soot concrete, rusted plate, hazard yellow.
import * as THREE from 'three';

function canvasTexture(size, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, random, base, flecks, count) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = flecks[Math.floor(random() * flecks.length)];
    ctx.globalAlpha = 0.08 + random() * 0.16;
    const w = 1 + random() * 3;
    ctx.fillRect(random() * size, random() * size, w, w);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures(random) {
  const concrete = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, random, '#5a5c60', ['#4a4c50', '#6a6c70', '#3e4043'], 900);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const y = random() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (random() * 8 - 4));
      ctx.stroke();
    }
  }, 8, 8);

  const plate = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, random, '#7a5a3c', ['#6a4c30', '#8a6a48', '#54371f'], 700);
    ctx.strokeStyle = 'rgba(30,18,8,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,30,0.10)';
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(random() * s, random() * s, 12 + random() * 30, 3 + random() * 6);
    }
  }, 4, 4);

  const hazard = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#191919';
    for (let x = -s; x < s * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  }, 6, 1);

  const darkMetal = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, random, '#33373c', ['#2a2e33', '#3e434a', '#23262a'], 600);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= s; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
  }, 3, 3);

  const floorYard = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, random, '#4c4a45', ['#3f3d39', '#5a5750', '#35332f'], 1100);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(random() * s, 0);
      ctx.lineTo(random() * s, s);
      ctx.stroke();
    }
  }, 10, 7);

  return { concrete, plate, hazard, darkMetal, floorYard };
}
