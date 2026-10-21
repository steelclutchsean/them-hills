// Painted busts for the paper dialogue card. Not character meshes.

export type PortraitId = 'pete' | 'mae' | 'silas' | 'ada' | 'jumper';

export function portraitIdFor(speaker: string): PortraitId {
  const name = speaker.toLowerCase();
  if (name.includes('pete')) return 'pete';
  if (name.includes('mae')) return 'mae';
  if (name.includes('silas') || name.includes('voss')) return 'silas';
  if (name.includes('ada') || name.includes('quinn')) return 'ada';
  if (name.includes('jumper')) return 'jumper';
  return 'pete';
}

export function paintPortrait(ctx: CanvasRenderingContext2D, id: PortraitId): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const paper = ctx.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#3a2a1c');
  paper.addColorStop(1, '#1c140e');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  const skin = id === 'ada' ? '#e4c8a8' : id === 'silas' ? '#c49a72' : '#d7b08a';
  const shirt =
    id === 'mae' ? '#c46a2a' : id === 'ada' ? '#1c1a22' : id === 'jumper' ? '#8c2f2f' : id === 'silas' ? '#5a4632' : '#6b4a2a';
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.92, w * 0.42, h * 0.28, 0, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.46, w * 0.28, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  if (id === 'pete' || id === 'mae' || id === 'jumper') {
    ctx.fillStyle = id === 'mae' ? '#2a140c' : id === 'jumper' ? '#3a2414' : '#6a6a68';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.3, w * 0.3, h * 0.12, 0, Math.PI, 0);
    ctx.fill();
  }
  if (id === 'pete') {
    ctx.fillStyle = '#d9d4cc';
    ctx.fillRect(w * 0.32, h * 0.52, w * 0.36, h * 0.1);
  }
  if (id === 'silas') {
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(w * 0.38, h * 0.58, w * 0.08, h * 0.05);
  }
  if (id === 'ada') {
    ctx.fillStyle = '#111018';
    ctx.fillRect(w * 0.22, h * 0.22, w * 0.56, h * 0.08);
    ctx.fillStyle = '#8a1e1e';
    ctx.fillRect(w * 0.46, h * 0.7, w * 0.08, h * 0.12);
  }

  ctx.fillStyle = '#1a120c';
  const eyeY = h * 0.44;
  ctx.fillRect(w * 0.36, eyeY, 5, 4);
  ctx.fillRect(w * 0.56, eyeY, 5, 4);
  ctx.strokeStyle = id === 'ada' ? '#6a3030' : '#6a4030';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (id === 'jumper') {
    ctx.arc(w / 2, h * 0.56, 6, 0.15, Math.PI - 0.15);
  } else if (id === 'ada') {
    ctx.moveTo(w * 0.4, h * 0.58);
    ctx.lineTo(w * 0.6, h * 0.56);
  } else {
    ctx.moveTo(w * 0.4, h * 0.56);
    ctx.quadraticCurveTo(w / 2, h * 0.6, w * 0.6, h * 0.56);
  }
  ctx.stroke();
}
