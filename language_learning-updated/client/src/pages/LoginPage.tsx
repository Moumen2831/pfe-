import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

type Tab = "login" | "register";

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [tab, setTab]           = useState<Tab>("login");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [loginId, setLoginId]         = useState("");
  const [loginPw, setLoginPw]         = useState("");
  const [regName, setRegName]         = useState("");
  const [regEmail, setRegEmail]       = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPw, setRegPw]             = useState("");
  const [regPw2, setRegPw2]           = useState("");

  if (isAuthenticated) {
    navigate("/dashboard");
    return null;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailOrUsername: loginId, password: loginPw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed"); return; }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (regPw !== regPw2) { setError("Passwords do not match"); return; }
    if (regPw.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: regName, email: regEmail, username: regUsername, password: regPw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed"); return; }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-grid" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="login-card">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="url(#logoGrad)" />
            <path d="M12 16h24M12 24h16M12 32h20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="36" cy="32" r="5" fill="white" fillOpacity="0.9" />
            <path d="M33.5 32l1.5 1.5 3-3" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="login-header">
          <h1 className="login-title">LinguaFlow</h1>
          <p className="login-subtitle">Your intelligent language learning companion</p>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setError(null); }}>Sign in</button>
          <button className={`tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setError(null); }}>Sign up</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {tab === "login" && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="field">
              <label>Email or username</label>
              <input type="text" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="you@email.com or yourusername" required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}{!loading && <span className="btn-arrow">→</span>}
            </button>
          </form>
        )}

        {tab === "register" && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="field">
              <label>Full name</label>
              <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Your name" autoFocus />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@email.com" required />
            </div>
            <div className="field">
              <label>Username</label>
              <input type="text" value={regUsername} onChange={e => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="your_username" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={regPw} onChange={e => setRegPw(e.target.value)} placeholder="at least 6 characters" required />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input type="password" value={regPw2} onChange={e => setRegPw2(e.target.value)} placeholder="repeat password" required />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}{!loading && <span className="btn-arrow">→</span>}
            </button>
          </form>
        )}

        <div className="login-features">
          {[{ icon: "🎯", text: "Personalized learning paths" },{ icon: "📊", text: "Track your progress" },{ icon: "🏆", text: "Earn achievements" }].map(f => (
            <div className="feature-item" key={f.text}>
              <span className="feature-icon">{f.icon}</span>
              <span className="feature-text">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        .login-root{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#070b14;position:relative;overflow:hidden;font-family:'Outfit',sans-serif;}
        .login-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(99,102,241,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%);}
        .orb{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;}
        .orb-1{width:500px;height:500px;background:radial-gradient(circle,rgba(99,102,241,.25) 0%,transparent 70%);top:-150px;right:-100px;animation:orbFloat 8s ease-in-out infinite;}
        .orb-2{width:400px;height:400px;background:radial-gradient(circle,rgba(139,92,246,.2) 0%,transparent 70%);bottom:-100px;left:-80px;animation:orbFloat 10s ease-in-out infinite reverse;}
        .orb-3{width:300px;height:300px;background:radial-gradient(circle,rgba(6,182,212,.15) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);animation:orbPulse 6s ease-in-out infinite;}
        @keyframes orbFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-30px) scale(1.05)}}
        @keyframes orbPulse{0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:.8;transform:translate(-50%,-50%) scale(1.1)}}
        .login-card{position:relative;z-index:10;width:100%;max-width:440px;margin:0 20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:36px 34px;backdrop-filter:blur(40px);box-shadow:0 0 0 1px rgba(99,102,241,.1),0 40px 80px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08);animation:cardIn .6s cubic-bezier(.16,1,.3,1) both;}
        @keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}
        .login-logo{display:flex;justify-content:center;margin-bottom:18px;}
        .login-header{text-align:center;margin-bottom:22px;}
        .login-title{font-size:1.85rem;font-weight:800;letter-spacing:-.03em;background:linear-gradient(135deg,#fff 30%,#a5b4fc 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px;}
        .login-subtitle{font-size:.87rem;color:rgba(255,255,255,.4);font-weight:400;}
        .tabs{display:flex;gap:4px;background:rgba(255,255,255,.04);border-radius:12px;padding:4px;margin-bottom:22px;}
        .tab{flex:1;padding:9px;border:none;border-radius:9px;font-family:'Outfit',sans-serif;font-size:.88rem;font-weight:500;cursor:pointer;transition:all .2s;background:transparent;color:rgba(255,255,255,.4);}
        .tab.active{background:rgba(99,102,241,.25);color:#c7d2fe;}
        .tab:hover:not(.active){color:rgba(255,255,255,.6);}
        .error-box{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#fca5a5;border-radius:10px;padding:10px 14px;font-size:.84rem;margin-bottom:16px;text-align:center;}
        .auth-form{display:flex;flex-direction:column;gap:13px;margin-bottom:22px;}
        .field{display:flex;flex-direction:column;gap:5px;}
        .field label{font-size:.78rem;color:rgba(255,255,255,.4);font-weight:500;letter-spacing:.04em;}
        .field input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 13px;color:#e2e8f0;font-family:'Outfit',sans-serif;font-size:.92rem;outline:none;transition:border-color .2s,box-shadow .2s;}
        .field input::placeholder{color:rgba(255,255,255,.2);}
        .field input:focus{border-color:rgba(99,102,241,.6);box-shadow:0 0 0 3px rgba(99,102,241,.12);}
        .submit-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 24px;border-radius:12px;border:1px solid rgba(99,102,241,.4);background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(139,92,246,.25));color:#c7d2fe;font-size:.92rem;font-weight:600;font-family:'Outfit',sans-serif;cursor:pointer;transition:all .2s;margin-top:4px;}
        .submit-btn:hover:not(:disabled){border-color:rgba(99,102,241,.7);box-shadow:0 0 28px rgba(99,102,241,.2);transform:translateY(-1px);}
        .submit-btn:disabled{opacity:.55;cursor:not-allowed;}
        .btn-arrow{margin-left:auto;opacity:.6;transition:transform .2s,opacity .2s;}
        .submit-btn:hover .btn-arrow{transform:translateX(4px);opacity:1;}
        .login-features{padding-top:18px;border-top:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:9px;}
        .feature-item{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:9px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04);}
        .feature-icon{font-size:1rem;width:26px;text-align:center;}
        .feature-text{font-size:.82rem;color:rgba(255,255,255,.45);}
      `}</style>
    </div>
  );
}
