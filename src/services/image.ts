// Utilitários de imagem no navegador.

/** Comprime uma imagem enviada pelo usuário (JPEG, lado maior até `max` px). */
export async function compressImage(file: File | Blob, max = 1200, quality = 0.86): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

/** Carrega uma imagem com CORS (para canvas/PDF). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem: ' + src.slice(0, 80)));
    img.src = src;
  });
}

/**
 * Desenha a imagem num canvas do tamanho final, opcionalmente removendo a sangria (MPCFill:
 * 1/8" em cada lado de uma carta de 2,5" × 3,5" → recorta ~3,4% horizontal e ~2,4% vertical).
 */
export function cropToDataUrl(img: HTMLImageElement, opts: { trimBleed?: boolean; maxWidth?: number; quality?: number; rotate?: boolean } = {}): string {
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (opts.trimBleed) {
    // Arte com sangria: 2,75" × 3,75" → mantém 2,5" × 3,5" central.
    const bx = sw * (0.125 / 2.75);
    const by = sh * (0.125 / 3.75);
    sx = bx;
    sy = by;
    sw -= bx * 2;
    sh -= by * 2;
  }
  const maxW = opts.maxWidth ?? 745;
  const scale = Math.min(1, maxW / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', opts.quality ?? 0.92);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename);
}

export function slugify(s: string): string {
  return (s || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'arquivo';
}
