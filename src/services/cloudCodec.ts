// Codec da nuvem: gzip (CompressionStream) + extração de imagens embutidas + divisão em pedaços.
// Funciona no navegador e no Node 18+ (testável com node:test).

/** Limite seguro por documento do Firestore (o máximo é ~1 MiB). */
export const MAX_DOC_BYTES = 900_000;
/** Tamanho de cada pedaço (string base64). */
export const CHUNK_SIZE = 700_000;

export interface EncodedPayload {
  /** Hash SHA-256 (hex) do JSON original — detecta mudanças. */
  hash: string;
  /** Dados gzip em base64 (inline quando cabem no documento principal). */
  data?: string;
  /** Pedaços quando não cabe num documento só. */
  chunks?: string[];
  /** Imagens embutidas (data: URLs) extraídas por hash. */
  images: Record<string, string>;
  rawBytes: number;
  gzBytes: number;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return streamToBytes(stream as ReadableStream<Uint8Array>);
}

export async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await streamToBytes(stream as ReadableStream<Uint8Array>));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const IMG_REF = 'cloudimg:';

/** Substitui data: URLs (imagens próprias) por referências "cloudimg:<hash>". */
export async function extractImages(value: unknown): Promise<{ value: unknown; images: Record<string, string> }> {
  const images: Record<string, string> = {};
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string') {
      if (v.startsWith('data:image/') && v.length > 2000) {
        const h = (await sha256Hex(v)).slice(0, 32);
        images[h] = v;
        return IMG_REF + h;
      }
      return v;
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x);
      return out;
    }
    return v;
  };
  return { value: await walk(value), images };
}

export function restoreImages(value: unknown, images: Record<string, string>): unknown {
  if (typeof value === 'string') return value.startsWith(IMG_REF) ? images[value.slice(IMG_REF.length)] ?? '' : value;
  if (Array.isArray(value)) return value.map((x) => restoreImages(x, images));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(value)) out[k] = restoreImages(x, images);
    return out;
  }
  return value;
}

/** Lista hashes de imagens referenciadas num valor já codificado. */
export function referencedImages(value: unknown, acc = new Set<string>()): Set<string> {
  if (typeof value === 'string' && value.startsWith(IMG_REF)) acc.add(value.slice(IMG_REF.length));
  else if (Array.isArray(value)) value.forEach((v) => referencedImages(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => referencedImages(v, acc));
  return acc;
}

export async function encodePayload(payload: unknown): Promise<EncodedPayload> {
  const { value, images } = await extractImages(payload);
  const json = JSON.stringify(value);
  const hash = await sha256Hex(JSON.stringify(payload));
  const gz = bytesToBase64(await gzip(json));
  const base = { hash, images, rawBytes: json.length, gzBytes: gz.length };
  if (gz.length <= MAX_DOC_BYTES) return { ...base, data: gz };
  const chunks: string[] = [];
  for (let i = 0; i < gz.length; i += CHUNK_SIZE) chunks.push(gz.slice(i, i + CHUNK_SIZE));
  return { ...base, chunks };
}

export async function decodePayload<T = unknown>(enc: { data?: string; chunks?: string[] }, images: Record<string, string>): Promise<T> {
  const b64 = enc.data ?? (enc.chunks ?? []).join('');
  if (!b64) throw new Error('Dados da nuvem vazios.');
  const json = await gunzip(base64ToBytes(b64));
  return restoreImages(JSON.parse(json), images) as T;
}
