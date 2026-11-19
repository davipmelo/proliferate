import { useState } from 'react';
import { Info, KeyRound, LogIn, Settings, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from '../../state/ui.tsx';
import { getFirebaseConfig, parseFirebaseConfig, saveFirebaseConfig, envConfig } from '../../services/firebaseConfig.ts';
import { Modal } from '../common/Modal.tsx';

type Mode = 'login' | 'register' | 'forgot' | 'config';

export default function AuthModal({ mode: initial, onClose }: { mode: 'login' | 'register' | 'config'; onClose: () => void }) {
  const configured = !!getFirebaseConfig();
  const [mode, setMode] = useState<Mode>(configured ? initial : 'config');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cfgText, setCfgText] = useState(() => {
    const c = getFirebaseConfig();
    return c?.source === 'local' ? JSON.stringify(c.config, null, 2) : '';
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      const fb = await import('../../services/firebase.ts').catch(() => null);
      setError(fb ? fb.authErrorMessage(e) : e?.message ?? 'Erro.');
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      const fb = await import('../../services/firebase.ts');
      if (mode === 'login') {
        await fb.login(email, password);
        toast('Bem-vindo de volta! Sincronizando…');
        onClose();
      } else if (mode === 'register') {
        await fb.register(username, email, password);
        toast('Conta criada. Seus dados serão sincronizados.');
        onClose();
      } else if (mode === 'forgot') {
        await fb.resetPassword(email);
        toast('Se o e-mail tiver conta, você receberá um link para redefinir a senha.', 'info', 6000);
        setMode('login');
      }
    });

  const saveConfig = () => {
    try {
      const c = parseFirebaseConfig(cfgText);
      saveFirebaseConfig(c);
      window.dispatchEvent(new Event('proliferate:firebase-config'));
      toast('Configuração do Firebase salva.');
      setMode('login');
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Configuração inválida.');
    }
  };

  const title = { login: 'Entrar', register: 'Criar conta', forgot: 'Recuperar senha', config: 'Configurar Firebase' }[mode];

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      tabs={
        mode !== 'config' && mode !== 'forgot' ? (
          <div className="modal-tabs">
            <button className={`modal-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}><LogIn size={15} /> Entrar</button>
            <button className={`modal-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}><UserPlus size={15} /> Criar conta</button>
          </div>
        ) : undefined
      }
    >
      {mode === 'config' ? (
        <>
          <div className="callout"><Info size={16} /><span>A sincronização usa o seu próprio projeto Firebase (gratuito). Ative <b>Authentication → E-mail/senha</b> e o <b>Firestore</b>, publique o <code>firestore.rules</code> do repositório e cole aqui o objeto <code>firebaseConfig</code> do app Web.</span></div>
          {envConfig() && <p className="small success-text">Este site já tem uma configuração embutida (variáveis VITE_*). Colar outra aqui a substitui só neste navegador.</p>}
          <textarea className="textarea mono" style={{ minHeight: 170 }} value={cfgText} onChange={(e) => setCfgText(e.target.value)} placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  appId: "…"\n};'} />
          {error && <div className="callout danger"><span>{error}</span></div>}
          <div className="row">
            {getFirebaseConfig()?.source === 'local' && <button className="btn btn-ghost btn-sm" onClick={() => { saveFirebaseConfig(null); setCfgText(''); window.dispatchEvent(new Event('proliferate:firebase-config')); toast('Configuração local removida.'); }}>Remover configuração local</button>}
            <div className="spacer" />
            {configured && <button className="btn btn-ghost" onClick={() => setMode('login')}>Voltar</button>}
            <button className="btn btn-primary" onClick={saveConfig} disabled={!cfgText.trim()}><Settings size={16} /> Salvar</button>
          </div>
        </>
      ) : (
        <form className="col" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {mode === 'register' && (
            <div className="field">
              <label>Nome de usuário</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="ex.: davi_mtg" required minLength={3} maxLength={24} />
              <span className="field-hint">Público. Seu e-mail é confidencial e nunca aparece para outras pessoas.</span>
            </div>
          )}
          <div className="field"><label>E-mail</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
          {mode !== 'forgot' && (
            <div className="field"><label>Senha</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={6} /></div>
          )}
          {error && <div className="callout danger"><span>{error}</span></div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Enviar link de recuperação'}
          </button>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {mode === 'forgot' ? (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMode('login')}>Voltar para entrar</button>
            ) : (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMode('forgot')}><KeyRound size={13} /> Esqueci a senha</button>
            )}
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMode('config')}><Settings size={13} /> Firebase</button>
          </div>
          <p className="xs subtle row" style={{ gap: 6 }}><ShieldCheck size={14} /> O app funciona sem conta; o login só sincroniza seus dados entre dispositivos.</p>
        </form>
      )}
    </Modal>
  );
}
