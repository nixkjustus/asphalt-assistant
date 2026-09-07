import { useState } from 'react';
import { APP_INFO } from '../types';

export default function LoginPage({ onLogin, onSignupClick, error }: { onLogin: (username: string, password: string) => Promise<{ success: boolean; message?: string }>; onSignupClick: () => void; error?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(error || null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setMsg('Enter username and password');
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await onLogin(username.trim(), password);
      if (!res.success) {
        setMsg(res.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at top, #1e1e1e 0%, #000000 70%)' }}>
      <div className="w-full max-w-md">
        <div className="bg-zinc-950 border-2 rounded-3xl p-8 shadow-2xl" style={{ borderColor: '#FF8C00' }}>
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative">
              <img src="/app-logo.png" alt="Asphalt Assistant Logo" className="w-48 h-48 object-contain rounded-2xl shadow-xl mb-4" onError={(e:any)=>{e.target.src='/asphalt-assistant-logo.png'}} />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-orange-500 border-2 border-black flex items-center justify-center text-[10px] font-black">v2</div>
            </div>
            <h1 className="text-3xl font-black tracking-tight leading-none" style={{ color: '#fff', textShadow: '0 2px 10px rgba(255,140,0,0.3)' }}>
              <span style={{ color: '#C0C0C0' }}>ASPHALT</span> <span style={{ color: '#FF8C00' }}>ASSISTANT</span>
            </h1>
            <p className="text-xs font-bold tracking-[0.2em] text-gray-400 mt-2">{APP_INFO.tagline.toUpperCase()}</p>
            <p className="text-[11px] text-gray-500 mt-2 max-w-[280px]">{APP_INFO.description} — Manage jobs, estimates, invoices, contracts offline. White-label ready for any paving company.</p>
            <div className="mt-4 px-3 py-1 rounded-full bg-zinc-900 border text-[10px] font-bold tracking-widest text-orange-400" style={{ borderColor: '#FF8C00' }}>SECURE • OFFLINE • WHITE-LABEL</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black tracking-widest text-gray-400 mb-2">USERNAME OR EMAIL</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" className="w-full px-4 py-3.5 rounded-xl bg-zinc-900 border-2 text-white placeholder-gray-500 outline-none focus:border-orange-500 transition" style={{ borderColor: '#2a2a2a' }} />
            </div>
            <div>
              <label className="block text-xs font-black tracking-widest text-gray-400 mb-2">PASSWORD</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3.5 rounded-xl bg-zinc-900 border-2 text-white placeholder-gray-500 outline-none focus:border-orange-500 transition pr-12" style={{ borderColor: '#2a2a2a' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-orange-400 text-xs font-bold">{showPassword ? 'HIDE' : 'SHOW'}</button>
              </div>
            </div>

            {msg && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-xl p-3 flex gap-2"><span>⚠️</span><span>{msg}</span></div>}

            <button type="submit" disabled={loading} className="w-full py-4 rounded-xl font-black text-white tracking-wide shadow-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #FF8C00 0%, #FF6B00 100%)' }}>
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> SIGNING IN...
                </>
              ) : '🔐 SIGN IN TO ASPHALT ASSISTANT'}
            </button>
          </form>

          <div className="mt-6 space-y-3">
            <button onClick={onSignupClick} className="w-full py-3.5 rounded-xl bg-white text-black text-sm font-black border-2 hover:bg-gray-100 transition flex items-center justify-center gap-2" style={{ borderColor: '#FF8C00' }}>
              <span>🏢</span> New Company? Create White-Label Account
            </button>
            <p className="text-[10px] text-center text-gray-600">Offline-capable • Encrypted local storage • No cloud required • Works on Android, iOS, Desktop</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-gray-600">
          <span>© {new Date().getFullYear()} {APP_INFO.name}</span>
          <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
          <span>v{APP_INFO.version} • White-Label Ready</span>
        </div>
      </div>
    </div>
  );
}
