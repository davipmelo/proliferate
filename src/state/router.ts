import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { parsePath, relativePath, type PathRoute } from '../services/routes.ts';

/**
 * Roteador mínimo baseado no History API. A aba e o item aberto ficam no caminho
 * (/decks/<id>); filtros ficam na query string (?q=…&cores=…).
 * - Trocar de página cria uma entrada no histórico (o "voltar" funciona).
 * - Mudar filtros substitui a entrada atual (não polui o histórico).
 */

const BASE = import.meta.env.BASE_URL;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  window.dispatchEvent(new Event('proliferate:route'));
}
window.addEventListener('popstate', emit);

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const currentPath = () => relativePath(window.location.pathname, BASE);

/** URL completa para um caminho relativo ("decks/abc?x=1"). */
export function hrefFor(path: string): string {
  return BASE + path.replace(/^\/+/, '');
}

/** Navega para um caminho relativo à base ("collection", "decks/abc", "explore/tokens?c=wu"). */
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const url = hrefFor(path);
  if (url === window.location.pathname + window.location.search) return;
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  emit();
  if (!opts.replace) window.scrollTo({ top: 0 });
}

/** Aba e segmentos atuais. Só re-renderiza quando o caminho muda (não a query). */
export function useRoute(): PathRoute {
  const path = useSyncExternalStore(subscribe, currentPath);
  return useMemo(() => parsePath(path), [path]);
}

function setParam(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : ''));
  emit();
}

/**
 * Um parâmetro da query string como estado ("" quando ausente).
 * Com `enabled = false` vira um estado local comum (ex.: o mesmo componente aberto dentro de um modal).
 */
export function useUrlParam(key: string, enabled = true): [string, (v: string) => void] {
  const fromUrl = useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(key) ?? '');
  const [local, setLocal] = useState('');
  const set = useCallback((v: string) => (enabled ? setParam(key, v) : setLocal(v)), [key, enabled]);
  return [enabled ? fromUrl : local, set];
}

/** Parâmetro com conversão de/para texto (listas, cores, enums). */
export function useUrlState<T>(key: string, from: (s: string) => T, to: (v: T) => string, enabled = true): [T, (v: T) => void] {
  const [raw, setRaw] = useUrlParam(key, enabled);
  const value = useMemo(() => from(raw), [raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((v: T) => setRaw(to(v)), [setRaw]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, set];
}
