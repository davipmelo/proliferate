// Configuração do Firebase (sem importar o SDK — leve).

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const LS_KEY = 'proliferate:firebase-config';

export function envConfig(): FirebaseConfig | null {
  const e = import.meta.env;
  if (!e?.VITE_FIREBASE_API_KEY || !e?.VITE_FIREBASE_PROJECT_ID) return null;
  return {
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN || `${e.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: e.VITE_FIREBASE_APP_ID,
  };
}

export function storedConfig(): FirebaseConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    return c?.apiKey && c?.projectId ? c : null;
  } catch {
    return null;
  }
}

export function getFirebaseConfig(): { config: FirebaseConfig; source: 'env' | 'local' } | null {
  const local = storedConfig();
  if (local) return { config: local, source: 'local' };
  const env = envConfig();
  return env ? { config: env, source: 'env' } : null;
}

export function saveFirebaseConfig(c: FirebaseConfig | null): void {
  if (c) localStorage.setItem(LS_KEY, JSON.stringify(c));
  else localStorage.removeItem(LS_KEY);
}

/**
 * Lê a configuração colada pelo usuário: aceita JSON ou o trecho JS do console do Firebase
 * (`const firebaseConfig = { apiKey: "..." , ... };`).
 */
export function parseFirebaseConfig(text: string): FirebaseConfig {
  const body = text.match(/\{[\s\S]*\}/)?.[0];
  if (!body) throw new Error('Cole o objeto firebaseConfig (com apiKey, authDomain, projectId, appId).');
  const obj: Record<string, string> = {};
  for (const m of body.matchAll(/["']?(\w+)["']?\s*:\s*["'`]([^"'`]+)["'`]/g)) obj[m[1]] = m[2];
  if (!obj.apiKey || !obj.projectId || !obj.appId) throw new Error('Faltam campos: apiKey, projectId e appId são obrigatórios.');
  return {
    apiKey: obj.apiKey,
    authDomain: obj.authDomain || `${obj.projectId}.firebaseapp.com`,
    projectId: obj.projectId,
    storageBucket: obj.storageBucket,
    messagingSenderId: obj.messagingSenderId,
    appId: obj.appId,
  };
}
