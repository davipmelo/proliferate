// Firebase (Auth + Firestore) — este módulo só é carregado sob demanda.
import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  signOut, updateProfile, type Auth, type User,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { getFirebaseConfig } from './firebaseConfig.ts';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function initFirebase(): { auth: Auth; db: Firestore } {
  if (auth && db) return { auth, db };
  const cfg = getFirebaseConfig();
  if (!cfg) throw new Error('Firebase não configurado.');
  app = getApps()[0] ?? initializeApp(cfg.config);
  auth = getAuth(app);
  db = getFirestore(app);
  return { auth, db };
}

export async function resetFirebase(): Promise<void> {
  if (app) await deleteApp(app).catch(() => undefined);
  app = null;
  auth = null;
  db = null;
}

export function watchAuth(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(initFirebase().auth, cb);
}

const USERNAME_RE = /^[a-z0-9_.-]{3,24}$/;

export function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

/** Mensagens de erro do Firebase em português. */
export function authErrorMessage(e: any): string {
  const code: string = e?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-password': 'Informe a senha.',
    'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
    'auth/email-already-in-use': 'Este e-mail já tem conta. Entre ou recupere a senha.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Conta não encontrada.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed': 'Ative o provedor “E-mail/senha” no console do Firebase.',
    'auth/invalid-api-key': 'Chave de API do Firebase inválida.',
    'permission-denied': 'Permissão negada pelo Firestore. Publique o firestore.rules do projeto.',
  };
  return map[code] ?? e?.message ?? 'Erro inesperado.';
}

/**
 * Cadastro: cria a conta com e-mail/senha e reserva o nome de usuário em /usernames/{nome}.
 * O e-mail nunca vai para um documento público — só o uid e o nome de usuário.
 */
export async function register(username: string, email: string, password: string): Promise<User> {
  const { auth, db } = initFirebase();
  const name = normalizeUsername(username);
  if (!USERNAME_RE.test(name)) throw new Error('Nome de usuário: 3–24 caracteres (letras, números, “_”, “.” ou “-”).');
  const taken = await getDoc(doc(db, 'usernames', name)).catch(() => null);
  if (taken?.exists()) throw new Error('Este nome de usuário já está em uso.');
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'usernames', name);
      const snap = await tx.get(ref);
      if (snap.exists()) throw new Error('Este nome de usuário já está em uso.');
      tx.set(ref, { uid: cred.user.uid, username: username.trim(), createdAt: serverTimestamp() });
    });
    await updateProfile(cred.user, { displayName: username.trim() });
  } catch (e) {
    // Desfaz a conta se o nome não pôde ser reservado.
    await cred.user.delete().catch(() => undefined);
    throw e;
  }
  return cred.user;
}

export async function login(email: string, password: string): Promise<User> {
  const { auth } = initFirebase();
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(initFirebase().auth, email.trim());
}

export async function logout(): Promise<void> {
  await signOut(initFirebase().auth);
}
