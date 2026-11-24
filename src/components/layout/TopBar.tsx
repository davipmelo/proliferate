import { Archive, Download, Upload, User, LogIn, LogOut, RefreshCw, Cloud, CloudOff, Settings, UserPlus } from 'lucide-react';
import type { TabId } from '../../types/models.ts';
import { TABS } from './tabs.ts';
import { Dropdown } from '../common/bits.tsx';
import { openAuth, openBackup, openExport, openImport } from '../launchers.tsx';
import { SYNC_LABELS, syncActions, useAccount } from '../../state/syncStatus.ts';
import { toast } from '../../state/ui.tsx';

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  proxyCount: number;
}

export function TopBar({ tab, onTab, proxyCount }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
      <a className="brand" href={import.meta.env.BASE_URL} onClick={(e) => { e.preventDefault(); onTab('decks'); }}>
        <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <span>Proliferate</span>
        <small>V2</small>
      </a>
      <nav className="tabs hide-mobile" aria-label="Abas">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => onTab(t.id)} aria-current={tab === t.id}>
            <t.icon size={17} />
            {t.label}
            {t.id === 'proxies' && proxyCount > 0 && <span className="badge badge-accent">{proxyCount}</span>}
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        <div className="row hide-mobile" style={{ gap: 2 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => openBackup()} title="Backup completo">
            <Archive size={16} /> Backup
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => openExport()} title="Exportar decks e coleção">
            <Upload size={16} /> Exportar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => openImport()} title="Importar listas e XML do MPCFill">
            <Download size={16} /> Importar
          </button>
        </div>
        <span className="topbar-divider hide-mobile" />
        <UserMenu />
      </div>
      </div>
    </header>
  );
}

function UserMenu() {
  const acc = useAccount();
  const name = acc.user?.username || acc.user?.email?.split('@')[0];
  return (
    <Dropdown
      trigger={(open, toggle) => (
        <button className={`btn btn-ghost btn-sm user-btn ${open ? 'active' : ''}`} onClick={toggle} aria-label="Menu do usuário" aria-expanded={open}>
          <span className={`sync-dot ${acc.user ? acc.sync : ''}`} />
          <User size={17} />
          <span className="hide-mobile ellipsis" style={{ maxWidth: 120 }}>{name ?? 'Entrar'}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {acc.user ? (
            <>
              <div className="menu-label">Conectado como</div>
              <div style={{ padding: '2px 10px 8px', fontWeight: 600 }}>{name}</div>
              <div className="row small muted" style={{ padding: '0 10px 8px' }}>
                {acc.sync === 'offline' ? <CloudOff size={14} /> : <Cloud size={14} />}
                {SYNC_LABELS[acc.sync]}
                {acc.lastSyncedAt && acc.sync === 'synced' && <span className="subtle">· {new Date(acc.lastSyncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
              {acc.error && acc.sync === 'error' && <div className="small danger-text" style={{ padding: '0 10px 8px' }}>{acc.error}</div>}
              <button
                className="menu-item"
                onClick={async () => {
                  close();
                  try {
                    await syncActions.syncNow?.();
                    toast('Sincronizado.');
                  } catch (e: any) {
                    toast(e?.message ?? 'Falha ao sincronizar.', 'error');
                  }
                }}
              >
                <RefreshCw size={16} /> Sincronizar Agora
              </button>
              <button className="menu-item" onClick={() => { close(); openAuth('config'); }}>
                <Settings size={16} /> Configurar Firebase
              </button>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={() => { close(); syncActions.logout?.(); }}>
                <LogOut size={16} /> Sair
              </button>
            </>
          ) : (
            <>
              <div className="small muted" style={{ padding: '6px 10px 8px', maxWidth: 260 }}>
                Seus dados ficam salvos neste navegador. Entre para sincronizar entre dispositivos.
              </div>
              <button className="menu-item" onClick={() => { close(); openAuth('login'); }}>
                <LogIn size={16} /> Entrar
              </button>
              <button className="menu-item" onClick={() => { close(); openAuth('register'); }}>
                <UserPlus size={16} /> Criar conta
              </button>
              <button className="menu-item" onClick={() => { close(); openAuth('config'); }}>
                <Settings size={16} /> Configurar Firebase
              </button>
            </>
          )}
          <div className="only-mobile">
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => { close(); openBackup(); }}><Archive size={16} /> Backup</button>
            <button className="menu-item" onClick={() => { close(); openExport(); }}><Upload size={16} /> Exportar</button>
            <button className="menu-item" onClick={() => { close(); openImport(); }}><Download size={16} /> Importar</button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
