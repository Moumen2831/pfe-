import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [skillModes, setSkillModes] = useState<Record<string, "course" | "test">>({
    listening: "course",
    speaking: "course",
    reading: "course",
    writing: "course",
  });

  useEffect(() => {
    const saved = localStorage.getItem("skillModes");
    if (saved) {
      try { setSkillModes(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const updateSkillMode = (skill: string, mode: "course" | "test") => {
    const updated = { ...skillModes, [skill]: mode };
    setSkillModes(updated);
    localStorage.setItem("skillModes", JSON.stringify(updated));
  };

  const { data: completedLessons, isLoading: lessonsLoading } = trpc.progress.getCompletedLessons.useQuery(undefined, { enabled: isAuthenticated });
  const { data: achievements, isLoading: achievementsLoading } = trpc.achievements.getUserAchievements.useQuery(undefined, { enabled: isAuthenticated });
  const { data: streak, isLoading: streakLoading } = trpc.streak.getStreak.useQuery(undefined, { enabled: isAuthenticated });
  const { data: allLessons, isLoading: allLessonsLoading } = trpc.lessons.all.useQuery();
  const { data: quizAttempts, isLoading: attemptsLoading } = trpc.progress.getQuizAttempts.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) {
    return (
      <div className="db-root">
        <div className="db-unauthenticated">
          <div className="db-unauth-icon">🔒</div>
          <h2>Please sign in to view your dashboard</h2>
          <button className="db-signin-btn" onClick={() => navigate("/login")}>Sign In</button>
        </div>
        <DBStyles />
      </div>
    );
  }

  const completionPct = allLessons && completedLessons
    ? Math.round((completedLessons.length / allLessons.length) * 100) : 0;

  const isLoading = lessonsLoading || achievementsLoading || streakLoading || allLessonsLoading || attemptsLoading;
  const recentAttempts = quizAttempts?.slice(0, 3) || [];
  const firstName = (user as any)?.name?.split(" ")[0] || "Scholar";

  const skills = [
    { id: "listening", label: "Listening", sublabel: "Aural Mastery",  icon: "🎧", pct: 80, current: 12, total: 15, color: "#06b6d4", color2: "#3b82f6", tip: "Focus on phonetics in chapter 4." },
    { id: "speaking",  label: "Speaking",  sublabel: "Oral Precision",  icon: "🎙️", pct: 53, current: 8,  total: 15, color: "#a78bfa", color2: "#6366f1", tip: "Refine accent on nasal vowels." },
    { id: "reading",   label: "Reading",   sublabel: "Contextual Flow", icon: "📖", pct: 93, current: 14, total: 15, color: "#f472b6", color2: "#ec4899", tip: "Next: Advanced Literary Analysis." },
    { id: "writing",   label: "Writing",   sublabel: "Syntactic Grip",  icon: "✍️", pct: 47, current: 7,  total: 15, color: "#34d399", color2: "#14b8a6", tip: "Focus on future perfect tense." },
  ];

  const upcomingLessons = [
    { id: 1, time: "10:00 AM", title: "French Subjunctive Mood II", desc: "Focus on irregular verb conjugations.", tag: "Today", color: "#06b6d4" },
    { id: 2, time: "02:30 PM", title: "Conversational Street Slang", desc: "Modern idioms used in Paris districts.", tag: "Today", color: "#a78bfa" },
    { id: 3, time: "04:00 PM", title: "Advanced Grammar Workshop", desc: "Deep dive into complex sentence structures.", tag: "Today", color: "#34d399" },
  ];

  const availableTests = [
    { id: 1, title: "Listening Comprehension", category: "Listening", difficulty: "Intermediate", questions: 15, duration: 20, color: "#06b6d4", color2: "#3b82f6" },
    { id: 2, title: "Speaking Fluency",        category: "Speaking",  difficulty: "Beginner",     questions: 10, duration: 15, color: "#a78bfa", color2: "#6366f1" },
    { id: 3, title: "Reading Comprehension",   category: "Reading",   difficulty: "Advanced",     questions: 20, duration: 30, color: "#f472b6", color2: "#ec4899" },
    { id: 4, title: "Writing Skills",          category: "Writing",   difficulty: "Intermediate", questions: 8,  duration: 25, color: "#34d399", color2: "#14b8a6" },
  ];

  return (
    <div className="db-root">
      <div className="db-bg">
        <div className="db-bg-mesh" />
        <div className="db-bg-orb db-bg-orb-1" />
        <div className="db-bg-orb db-bg-orb-2" />
      </div>
      <main className="db-main">
        {isLoading ? (
          <div className="db-loading"><Loader2 className="db-spinner" /></div>
        ) : (
          <>
            <header className="db-header">
              <div className="db-header-left">
                <div className="db-greeting-tag">DASHBOARD</div>
                <h1 className="db-greeting">Good morning, <span className="db-name">{firstName}</span></h1>
                <p className="db-subtitle">You're <strong>{completionPct}%</strong> towards your weekly goal. Keep it up!</p>
              </div>
              <div className="db-header-stats">
                <StatPill icon="🔥" label="Day Streak" value={(streak as any)?.currentStreak ?? 0} color="#f97316" />
                <StatPill icon="⭐" label="Achievements" value={achievements?.length ?? 0} color="#eab308" />
                <StatPill icon="✅" label="Lessons Done" value={completedLessons?.length ?? 0} color="#22c55e" />
              </div>
            </header>

            <section className="db-section">
              <SectionTitle title="Skill Progress" subtitle="Track each skill independently" />
              <div className="db-skills-grid">
                {skills.map(s => (
                  <SkillCard key={s.id} skill={s} mode={skillModes[s.id] || "course"}
                    onModeChange={(m) => updateSkillMode(s.id, m)}
                    onTestClick={() => navigate("/test")} />
                ))}
              </div>
            </section>

            <section className="db-section db-two-col">
              <div className="db-panel">
                <div className="db-panel-header">
                  <h3 className="db-panel-title">Recent Tests</h3>
                  <button className="db-panel-link" onClick={() => navigate("/test-history")}>View All →</button>
                </div>
                <div className="db-recent-list">
                  {recentAttempts.length > 0 ? recentAttempts.map((a: any, i: number) => (
                    <div key={a.id} className="db-recent-item" style={{ "--accent": (["#06b6d4","#a78bfa","#34d399"] as string[])[i] } as React.CSSProperties}>
                      <div className="db-recent-icon">📝</div>
                      <div className="db-recent-info">
                        <span className="db-recent-name">Quiz Attempt</span>
                        <span className="db-recent-date">{new Date(a.completedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="db-recent-score">{a.score}%</div>
                    </div>
                  )) : (
                    <div className="db-empty"><span className="db-empty-icon">📋</span><span>No quiz attempts yet</span></div>
                  )}
                </div>
              </div>
              <div className="db-panel">
                <div className="db-panel-header">
                  <h3 className="db-panel-title">Achievements</h3>
                  <span className="db-panel-badge">{achievements?.length ?? 0} earned</span>
                </div>
                <div className="db-achievements-grid">
                  {achievements && achievements.length > 0 ? (
                    <>
                      {achievements.slice(0, 3).map((a: any) => (
                        <div className="db-achievement db-achievement-earned" key={a.achievementId} title={a.name}>
                          <span className="db-achievement-emoji">⭐</span>
                          <span className="db-achievement-label">{a.name?.slice(0,8)}</span>
                        </div>
                      ))}
                      {[...Array(Math.max(0, 6 - (achievements?.length || 0)))].map((_,i) => (
                        <div className="db-achievement db-achievement-locked" key={"l"+i}><span className="db-achievement-emoji">🔒</span></div>
                      ))}
                    </>
                  ) : (
                    [...Array(6)].map((_,i) => (
                      <div className="db-achievement db-achievement-locked" key={i}><span className="db-achievement-emoji">🔒</span></div>
                    ))
                  )}
                </div>
                <p className="db-achievements-hint">Complete lessons to unlock achievements</p>
              </div>
            </section>

            <section className="db-section">
              <SectionTitle title="Available Tests" subtitle="Challenge yourself and track your results" />
              <div className="db-tests-grid">
                {availableTests.map(t => (
                  <div className="db-test-card" key={t.id} onClick={() => navigate("/test")}
                    style={{ "--c1": t.color, "--c2": t.color2 } as React.CSSProperties}>
                    <div className="db-test-header">
                      <span className="db-test-category">{t.category}</span>
                      <span className="db-test-diff">{t.difficulty}</span>
                    </div>
                    <h4 className="db-test-title">{t.title}</h4>
                    <div className="db-test-meta"><span>📝 {t.questions} questions</span><span>⏱ {t.duration} min</span></div>
                    <button className="db-test-btn">Start Test →</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="db-section">
              <SectionTitle title="Upcoming Lessons" subtitle="Your schedule for today" />
              <div className="db-timeline">
                {upcomingLessons.map(l => (
                  <div className="db-timeline-item" key={l.id}>
                    <div className="db-timeline-time">
                      <span className="db-time-value">{l.time}</span>
                      <span className="db-time-tag">{l.tag}</span>
                    </div>
                    <div className="db-timeline-dot" style={{ background: l.color, boxShadow: `0 0 12px ${l.color}` }} />
                    <div className="db-timeline-card" style={{ "--accent": l.color } as React.CSSProperties}>
                      <h4 className="db-timeline-title">{l.title}</h4>
                      <p className="db-timeline-desc">{l.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
      <DBStyles />
    </div>
  );
}

function StatPill({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="db-stat-pill" style={{ "--c": color } as React.CSSProperties}>
      <span className="db-stat-icon">{icon}</span>
      <div className="db-stat-info">
        <span className="db-stat-value">{value}</span>
        <span className="db-stat-label">{label}</span>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="db-section-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

interface SkillCardProps {
  skill: { id: string; label: string; sublabel: string; icon: string; pct: number; current: number; total: number; color: string; color2: string; tip: string };
  mode: "course" | "test";
  onModeChange: (m: "course" | "test") => void;
  onTestClick: () => void;
}

function SkillCard({ skill, mode, onModeChange, onTestClick }: SkillCardProps) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (skill.pct / 100) * circ;
  const gId = "g-" + skill.id;
  return (
    <div className="db-skill-card" style={{ "--c1": skill.color, "--c2": skill.color2 } as React.CSSProperties}>
      <div className="db-skill-top">
        <div>
          <div className="db-skill-sublabel">{skill.sublabel}</div>
          <div className="db-skill-label">{skill.label}</div>
        </div>
        <span className="db-skill-icon">{skill.icon}</span>
      </div>
      <div className="db-toggle">
        <button className={"db-toggle-btn" + (mode==="course" ? " active" : "")} onClick={() => onModeChange("course")}>Course</button>
        <button className={"db-toggle-btn" + (mode==="test" ? " active" : "")} onClick={() => mode==="test" ? onTestClick() : onModeChange("test")}>Test</button>
      </div>
      <div className="db-ring-wrap">
        <svg width="136" height="136" viewBox="0 0 136 136">
          <defs>
            <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={skill.color} />
              <stop offset="100%" stopColor={skill.color2} />
            </linearGradient>
          </defs>
          <circle cx="68" cy="68" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
          <circle cx="68" cy="68" r={radius} fill="none" stroke={"url(#"+gId+")"}
            strokeWidth="10" strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 68 68)"
            style={{ filter: `drop-shadow(0 0 8px ${skill.color}88)` }} />
        </svg>
        <div className="db-ring-pct">{skill.pct}%</div>
      </div>
      <div className="db-skill-bar-row">
        <span>{mode==="course" ? "Lessons" : "Tests"}</span>
        <span className="db-skill-bar-count">{skill.current}/{skill.total}</span>
      </div>
      <div className="db-skill-bar-track">
        <div className="db-skill-bar-fill" style={{ width: `${(skill.current/skill.total)*100}%` }} />
      </div>
      <div className="db-skill-tip">💡 {skill.tip}</div>
    </div>
  );
}

function DBStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
      .db-root { min-height:100vh; background:#080d1a; color:#e2e8f0; font-family:'Outfit',sans-serif; position:relative; }
      .db-bg { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
      .db-bg-mesh { position:absolute; inset:0; background-image:linear-gradient(rgba(99,102,241,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.04) 1px,transparent 1px); background-size:56px 56px; }
      .db-bg-orb { position:absolute; border-radius:50%; filter:blur(100px); }
      .db-bg-orb-1 { width:700px;height:700px; background:radial-gradient(circle,rgba(99,102,241,.12) 0%,transparent 70%); top:-200px;right:-200px; animation:dbOrb 12s ease-in-out infinite; }
      .db-bg-orb-2 { width:600px;height:600px; background:radial-gradient(circle,rgba(6,182,212,.08) 0%,transparent 70%); bottom:-200px;left:-100px; animation:dbOrb 15s ease-in-out infinite reverse; }
      @keyframes dbOrb { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(-20px,-30px) scale(1.05);} }
      .db-main { position:relative;z-index:1; max-width:1280px;margin:0 auto; padding:40px 32px 80px; }
      .db-loading { display:flex;justify-content:center;align-items:center;min-height:50vh; }
      .db-spinner { width:36px;height:36px;color:#6366f1;animation:spin 1s linear infinite; }
      @keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
      .db-unauthenticated { display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px;color:rgba(255,255,255,.5); }
      .db-unauth-icon { font-size:3rem; }
      .db-signin-btn { padding:12px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:12px;font-size:.95rem;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;transition:transform .2s,box-shadow .2s; }
      .db-signin-btn:hover { transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,.4); }
      .db-header { display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:24px;margin-bottom:48px;padding-bottom:32px;border-bottom:1px solid rgba(255,255,255,.05); }
      .db-greeting-tag { font-size:.7rem;letter-spacing:.14em;color:#6366f1;font-weight:700;text-transform:uppercase;margin-bottom:8px; }
      .db-greeting { font-size:2.4rem;font-weight:800;letter-spacing:-.03em;color:#f1f5f9;margin-bottom:8px;line-height:1.15; }
      .db-name { background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text; }
      .db-subtitle { color:rgba(255,255,255,.45);font-size:.95rem; }
      .db-subtitle strong { color:#a5b4fc;font-weight:600; }
      .db-header-stats { display:flex;gap:12px;flex-wrap:wrap; }
      .db-stat-pill { display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px 16px;transition:border-color .2s,background .2s; }
      .db-stat-pill:hover { background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12); }
      .db-stat-icon { font-size:1.3rem; }
      .db-stat-info { display:flex;flex-direction:column; }
      .db-stat-value { font-size:1.2rem;font-weight:700;color:var(--c);line-height:1; }
      .db-stat-label { font-size:.72rem;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em; }
      .db-section { margin-bottom:52px; }
      .db-section-title { margin-bottom:20px; }
      .db-section-title h2 { font-size:1.35rem;font-weight:700;color:#f1f5f9;letter-spacing:-.02em;margin-bottom:4px; }
      .db-section-title p { font-size:.85rem;color:rgba(255,255,255,.35); }
      .db-skills-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px; }
      .db-skill-card { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:24px;transition:transform .25s,box-shadow .25s,border-color .25s;position:relative;overflow:hidden; }
      .db-skill-card:hover { transform:translateY(-4px);border-color:rgba(255,255,255,.14);box-shadow:0 20px 40px rgba(0,0,0,.3); }
      .db-skill-top { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px; }
      .db-skill-sublabel { font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--c1);font-weight:700;margin-bottom:4px; }
      .db-skill-label { font-size:1.15rem;font-weight:700;color:#f1f5f9; }
      .db-skill-icon { font-size:1.5rem; }
      .db-toggle { display:flex;background:rgba(255,255,255,.05);border-radius:10px;padding:3px;margin-bottom:20px;border:1px solid rgba(255,255,255,.06); }
      .db-toggle-btn { flex:1;padding:7px 10px;border-radius:8px;border:none;background:transparent;color:rgba(255,255,255,.4);font-size:.82rem;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s; }
      .db-toggle-btn.active { background:linear-gradient(135deg,var(--c1),var(--c2));color:white;box-shadow:0 2px 8px rgba(0,0,0,.3); }
      .db-ring-wrap { position:relative;width:136px;height:136px;margin:0 auto 20px; }
      .db-ring-pct { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;color:#f1f5f9; }
      .db-skill-bar-row { display:flex;justify-content:space-between;font-size:.8rem;color:rgba(255,255,255,.35);margin-bottom:6px; }
      .db-skill-bar-count { color:var(--c1);font-weight:600; }
      .db-skill-bar-track { height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;margin-bottom:16px; }
      .db-skill-bar-fill { height:100%;background:linear-gradient(90deg,var(--c1),var(--c2));border-radius:3px; }
      .db-skill-tip { font-size:.78rem;color:rgba(255,255,255,.35);border-top:1px solid rgba(255,255,255,.06);padding-top:12px; }
      .db-two-col { display:grid;grid-template-columns:1fr 1fr;gap:20px; }
      .db-panel { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:24px; }
      .db-panel-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:20px; }
      .db-panel-title { font-size:1rem;font-weight:700;color:#f1f5f9; }
      .db-panel-link { font-size:.8rem;color:#818cf8;cursor:pointer;background:none;border:none;font-family:'Outfit',sans-serif; }
      .db-panel-link:hover { color:#a5b4fc; }
      .db-panel-badge { font-size:.78rem;background:rgba(99,102,241,.15);color:#a5b4fc;padding:3px 10px;border-radius:20px;font-weight:600; }
      .db-recent-list { display:flex;flex-direction:column;gap:10px; }
      .db-recent-item { display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);transition:background .2s; }
      .db-recent-item:hover { background:rgba(255,255,255,.06); }
      .db-recent-icon { font-size:1.2rem;width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center; }
      .db-recent-info { flex:1; }
      .db-recent-name { font-size:.88rem;font-weight:600;color:#e2e8f0;display:block; }
      .db-recent-date { font-size:.75rem;color:rgba(255,255,255,.3); }
      .db-recent-score { font-size:1.1rem;font-weight:800;color:var(--accent,#06b6d4); }
      .db-empty { display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px;color:rgba(255,255,255,.25);font-size:.85rem; }
      .db-empty-icon { font-size:2rem; }
      .db-achievements-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px; }
      .db-achievement { aspect-ratio:1;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid;font-size:.7rem;font-weight:600;text-align:center;transition:transform .2s; }
      .db-achievement:hover { transform:scale(1.05); }
      .db-achievement-earned { background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.3);color:#a5b4fc; }
      .db-achievement-locked { background:rgba(255,255,255,.02);border-color:rgba(255,255,255,.05);color:rgba(255,255,255,.15); }
      .db-achievement-emoji { font-size:1.3rem; }
      .db-achievement-label { font-size:.65rem;color:rgba(255,255,255,.35);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px; }
      .db-achievements-hint { font-size:.75rem;color:rgba(255,255,255,.25);text-align:center; }
      .db-tests-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px; }
      .db-test-card { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:22px;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s;position:relative;overflow:hidden; }
      .db-test-card::after { content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--c1),var(--c2));opacity:0;transition:opacity .2s; }
      .db-test-card:hover { transform:translateY(-3px);border-color:rgba(255,255,255,.12);box-shadow:0 12px 30px rgba(0,0,0,.25); }
      .db-test-card:hover::after { opacity:1; }
      .db-test-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:12px; }
      .db-test-category { font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:var(--c1);font-weight:700; }
      .db-test-diff { font-size:.72rem;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);font-weight:600; }
      .db-test-title { font-size:1rem;font-weight:700;color:#f1f5f9;margin-bottom:12px;line-height:1.3; }
      .db-test-meta { display:flex;gap:16px;font-size:.8rem;color:rgba(255,255,255,.35);margin-bottom:16px; }
      .db-test-btn { width:100%;padding:10px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--c1),var(--c2));color:white;font-size:.88rem;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif;transition:box-shadow .2s,transform .2s; }
      .db-test-btn:hover { box-shadow:0 4px 16px rgba(0,0,0,.3);transform:translateY(-1px); }
      .db-timeline { position:relative;display:flex;flex-direction:column; }
      .db-timeline::before { content:'';position:absolute;left:118px;top:0;bottom:0;width:1px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.08) 20%,rgba(255,255,255,.08) 80%,transparent); }
      .db-timeline-item { display:flex;align-items:center;gap:0;margin-bottom:20px; }
      .db-timeline-time { width:100px;text-align:right;padding-right:18px;flex-shrink:0; }
      .db-time-value { display:block;font-size:.88rem;font-weight:700;color:#f1f5f9; }
      .db-time-tag { display:block;font-size:.68rem;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.06em; }
      .db-timeline-dot { width:12px;height:12px;border-radius:50%;flex-shrink:0;margin:0 16px;position:relative;z-index:1; }
      .db-timeline-card { flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 20px;cursor:pointer;transition:background .2s,border-color .2s;border-left:3px solid var(--accent,#6366f1); }
      .db-timeline-card:hover { background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12); }
      .db-timeline-title { font-size:.95rem;font-weight:700;color:#f1f5f9;margin-bottom:4px; }
      .db-timeline-desc { font-size:.8rem;color:rgba(255,255,255,.35); }
      @media(max-width:768px) { .db-two-col{grid-template-columns:1fr;} }
      @media(max-width:640px) { .db-main{padding:24px 16px 60px;} .db-greeting{font-size:1.8rem;} .db-skills-grid{grid-template-columns:1fr;} .db-timeline::before{display:none;} .db-timeline-time{width:auto;text-align:left;padding-right:0;margin-bottom:8px;} .db-timeline-dot{display:none;} .db-timeline-item{flex-direction:column;align-items:flex-start;} }
    `}</style>
  );
}
