import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function TestPage() {
  const [, navigate] = useLocation();
  const [selectedTest, setSelectedTest] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");

  const allTests = [
    { id: 1, title: "Listening Comprehension Level 1", category: "Listening", difficulty: "Beginner",     questions: 10, duration: 15, desc: "Test your ability to understand spoken French at a basic level.", color: "#06b6d4", color2: "#3b82f6", attempts: 2, bestScore: 85 },
    { id: 2, title: "Listening Comprehension Level 2", category: "Listening", difficulty: "Intermediate", questions: 15, duration: 20, desc: "Intermediate listening comprehension with natural speech patterns.", color: "#06b6d4", color2: "#3b82f6", attempts: 1, bestScore: 72 },
    { id: 3, title: "Speaking Fluency Test",           category: "Speaking",  difficulty: "Beginner",     questions: 10, duration: 15, desc: "Record and evaluate your speaking fluency and pronunciation.", color: "#a78bfa", color2: "#6366f1", attempts: 0, bestScore: 0 },
    { id: 4, title: "Advanced Speaking",               category: "Speaking",  difficulty: "Advanced",     questions: 12, duration: 25, desc: "Advanced speaking test with complex conversation scenarios.", color: "#a78bfa", color2: "#6366f1", attempts: 0, bestScore: 0 },
    { id: 5, title: "Reading Comprehension Level 1",   category: "Reading",   difficulty: "Beginner",     questions: 12, duration: 18, desc: "Read short texts and answer comprehension questions.", color: "#f472b6", color2: "#ec4899", attempts: 3, bestScore: 92 },
    { id: 6, title: "Reading Comprehension Level 2",   category: "Reading",   difficulty: "Intermediate", questions: 18, duration: 25, desc: "Read longer, more complex texts and answer detailed questions.", color: "#f472b6", color2: "#ec4899", attempts: 2, bestScore: 78 },
    { id: 7, title: "Writing Skills Test",             category: "Writing",   difficulty: "Intermediate", questions: 8,  duration: 25, desc: "Write essays and short texts to demonstrate writing skills.", color: "#34d399", color2: "#14b8a6", attempts: 1, bestScore: 68 },
    { id: 8, title: "Advanced Writing",                category: "Writing",   difficulty: "Advanced",     questions: 10, duration: 35, desc: "Advanced writing test with complex writing tasks.", color: "#34d399", color2: "#14b8a6", attempts: 0, bestScore: 0 },
    { id: 9, title: "IELTS Full Test",                 category: "IELTS",     difficulty: "Advanced",     questions: 80, duration: 240, desc: "Complete IELTS test with all four sections. Timer-based with automatic progression.", color: "#fb923c", color2: "#ef4444", attempts: 0, bestScore: 0, isIelts: true },
  ];

  const categories = ["All", "Listening", "Speaking", "Reading", "Writing", "IELTS"];
  const difficulties = ["All", "Beginner", "Intermediate", "Advanced"];

  const filtered = allTests.filter(t => {
    return (selectedCategory === "All" || t.category === selectedCategory)
        && (selectedDifficulty === "All" || t.difficulty === selectedDifficulty);
  });

  const handleStart = (testId: number, isIelts?: boolean) => {
    setSelectedTest(testId);
    setIsStarting(true);
    setTimeout(() => {
      if (isIelts) navigate("/ielts-test");
      else navigate(`/quiz?testId=${testId}`);
    }, 500);
  };

  const diffColor: Record<string,string> = { Beginner: "#22c55e", Intermediate: "#f59e0b", Advanced: "#ef4444" };

  return (
    <div className="tp-root">
      {/* Background */}
      <div className="tp-bg">
        <div className="tp-bg-mesh" />
        <div className="tp-bg-orb tp-bg-orb-1" />
        <div className="tp-bg-orb tp-bg-orb-2" />
      </div>

      <main className="tp-main">
        {/* Header */}
        <header className="tp-header">
          <button className="tp-back" onClick={() => navigate("/dashboard")}>
            ← Back to Dashboard
          </button>
          <div className="tp-header-content">
            <div className="tp-header-left">
              <div className="tp-title-tag">TEST CENTER</div>
              <h1 className="tp-title">Available Tests</h1>
              <p className="tp-subtitle">
                Challenge yourself · <span className="tp-count">{filtered.length} tests</span> matching filters
              </p>
            </div>
            <div className="tp-header-summary">
              <div className="tp-summary-stat">
                <span className="tp-summary-num">{allTests.reduce((a,t) => a + t.attempts, 0)}</span>
                <span className="tp-summary-lbl">Total Attempts</span>
              </div>
              <div className="tp-summary-divider" />
              <div className="tp-summary-stat">
                <span className="tp-summary-num">{Math.round(allTests.filter(t=>t.attempts>0).reduce((a,t)=>a+t.bestScore,0) / Math.max(1,allTests.filter(t=>t.attempts>0).length))}%</span>
                <span className="tp-summary-lbl">Avg Best Score</span>
              </div>
              <div className="tp-summary-divider" />
              <div className="tp-summary-stat">
                <span className="tp-summary-num">{allTests.length}</span>
                <span className="tp-summary-lbl">Total Tests</span>
              </div>
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="tp-filters">
          <div className="tp-filter-group">
            <div className="tp-filter-label">Category</div>
            <div className="tp-filter-chips">
              {categories.map(c => (
                <button key={c} className={"tp-chip" + (selectedCategory===c ? " active" : "")}
                  onClick={() => setSelectedCategory(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="tp-filter-group">
            <div className="tp-filter-label">Difficulty</div>
            <div className="tp-filter-chips">
              {difficulties.map(d => (
                <button key={d} className={"tp-chip tp-chip-diff" + (selectedDifficulty===d ? " active" : "")}
                  data-diff={d}
                  onClick={() => setSelectedDifficulty(d)}
                  style={selectedDifficulty===d && d!=="All" ? { background: diffColor[d]+"22", borderColor: diffColor[d]+"66", color: diffColor[d] } : {}}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Cards Grid */}
        {filtered.length > 0 ? (
          <div className="tp-grid">
            {filtered.map(test => {
              const isSelected = selectedTest === test.id;
              const hasScore = test.attempts > 0;
              const scoreColor = test.bestScore >= 80 ? "#22c55e" : test.bestScore >= 60 ? "#f59e0b" : "#ef4444";
              return (
                <div key={test.id} className={"tp-card" + (isSelected ? " selected" : "")}
                  style={{ "--c1": test.color, "--c2": test.color2 } as React.CSSProperties}
                  onClick={() => setSelectedTest(isSelected ? null : test.id)}>
                  {/* Top glow strip */}
                  <div className="tp-card-strip" />

                  {/* Header row */}
                  <div className="tp-card-top">
                    <span className="tp-card-cat">{test.category}</span>
                    <span className="tp-card-diff"
                      style={{ color: diffColor[test.difficulty], background: diffColor[test.difficulty]+"18", borderColor: diffColor[test.difficulty]+"33" }}>
                      {test.difficulty}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className="tp-card-icon-wrap">
                    <div className="tp-card-icon">
                      {test.category === "Listening" ? "🎧" : test.category === "Speaking" ? "🎙️" : test.category === "Reading" ? "📖" : test.category === "Writing" ? "✍️" : "🏆"}
                    </div>
                  </div>

                  <h3 className="tp-card-title">{test.title}</h3>
                  <p className="tp-card-desc">{test.desc}</p>

                  <div className="tp-card-meta">
                    <span className="tp-meta-item">📝 {test.questions} questions</span>
                    <span className="tp-meta-item">⏱ {test.duration} min</span>
                  </div>

                  {hasScore && (
                    <div className="tp-card-score">
                      <div className="tp-score-bar-track">
                        <div className="tp-score-bar-fill" style={{ width: `${test.bestScore}%`, background: scoreColor }} />
                      </div>
                      <div className="tp-score-row">
                        <span className="tp-score-label">Best Score</span>
                        <span className="tp-score-value" style={{ color: scoreColor }}>{test.bestScore}%</span>
                      </div>
                      <span className="tp-attempts">{test.attempts} attempt{test.attempts!==1?"s":""}</span>
                    </div>
                  )}

                  {!hasScore && (
                    <div className="tp-card-new">
                      <span className="tp-new-badge">✨ New</span>
                      <span className="tp-new-text">Not attempted yet</span>
                    </div>
                  )}

                  <button className="tp-start-btn"
                    onClick={e => { e.stopPropagation(); handleStart(test.id, (test as any).isIelts); }}
                    disabled={isStarting && isSelected}>
                    {isStarting && isSelected ? (
                      <><Loader2 style={{ width:16,height:16,display:'inline',animation:'spin 1s linear infinite' }} /> Starting...</>
                    ) : (
                      <>{hasScore ? "Retry Test" : "Start Test"} →</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tp-empty">
            <span style={{ fontSize:"3rem" }}>🔍</span>
            <h3>No tests found</h3>
            <p>Try adjusting your filters to find available tests.</p>
            <button className="tp-reset-btn" onClick={() => { setSelectedCategory("All"); setSelectedDifficulty("All"); }}>
              Clear Filters
            </button>
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }

        .tp-root { min-height:100vh;background:#080d1a;color:#e2e8f0;font-family:'Outfit',sans-serif;position:relative; }
        .tp-bg { position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden; }
        .tp-bg-mesh { position:absolute;inset:0;background-image:linear-gradient(rgba(99,102,241,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.04) 1px,transparent 1px);background-size:56px 56px; }
        .tp-bg-orb { position:absolute;border-radius:50%;filter:blur(100px); }
        .tp-bg-orb-1 { width:700px;height:700px;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 70%);top:-200px;right:-200px;animation:dbOrb 12s ease-in-out infinite; }
        .tp-bg-orb-2 { width:500px;height:500px;background:radial-gradient(circle,rgba(139,92,246,.08) 0%,transparent 70%);bottom:-200px;left:-100px;animation:dbOrb 15s ease-in-out infinite reverse; }
        @keyframes dbOrb { 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(-20px,-30px) scale(1.05);} }

        .tp-main { position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:40px 32px 80px; }

        .tp-back { background:none;border:none;color:#818cf8;font-size:.9rem;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;display:flex;align-items:center;gap:6px;margin-bottom:24px;transition:color .2s; }
        .tp-back:hover { color:#a5b4fc; }

        .tp-header { margin-bottom:36px; }
        .tp-header-content { display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:24px; }
        .tp-title-tag { font-size:.7rem;letter-spacing:.14em;color:#6366f1;font-weight:700;text-transform:uppercase;margin-bottom:8px; }
        .tp-title { font-size:2.4rem;font-weight:800;letter-spacing:-.03em;color:#f1f5f9;margin-bottom:8px;line-height:1.15; }
        .tp-subtitle { color:rgba(255,255,255,.4);font-size:.95rem; }
        .tp-count { color:#818cf8;font-weight:600; }

        .tp-header-summary { display:flex;align-items:center;gap:0;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:16px 24px;margin-top:8px; }
        .tp-summary-stat { display:flex;flex-direction:column;align-items:center;padding:0 20px; }
        .tp-summary-num { font-size:1.5rem;font-weight:800;color:#a5b4fc;line-height:1; }
        .tp-summary-lbl { font-size:.72rem;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin-top:4px; }
        .tp-summary-divider { width:1px;height:40px;background:rgba(255,255,255,.07); }

        .tp-filters { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:24px;margin-bottom:32px;display:flex;flex-wrap:wrap;gap:24px; }
        .tp-filter-group { flex:1;min-width:200px; }
        .tp-filter-label { font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.35);font-weight:700;margin-bottom:10px; }
        .tp-filter-chips { display:flex;flex-wrap:wrap;gap:8px; }
        .tp-chip { padding:7px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);font-size:.82rem;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s; }
        .tp-chip:hover { background:rgba(255,255,255,.08);color:rgba(255,255,255,.8); }
        .tp-chip.active { background:rgba(99,102,241,.2);border-color:rgba(99,102,241,.5);color:#a5b4fc; }

        .tp-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px; }

        .tp-card { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:24px;cursor:pointer;transition:transform .25s,box-shadow .25s,border-color .25s;position:relative;overflow:hidden; }
        .tp-card:hover { transform:translateY(-4px);border-color:rgba(255,255,255,.15);box-shadow:0 16px 40px rgba(0,0,0,.35); }
        .tp-card.selected { border-color:var(--c1,#6366f1);box-shadow:0 0 0 1px var(--c1,#6366f1),0 16px 40px rgba(0,0,0,.35); }

        .tp-card-strip { position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--c1),var(--c2));opacity:0;transition:opacity .25s; }
        .tp-card:hover .tp-card-strip, .tp-card.selected .tp-card-strip { opacity:1; }

        .tp-card-top { display:flex;justify-content:space-between;align-items:center;margin-bottom:16px; }
        .tp-card-cat { font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:var(--c1);font-weight:700; }
        .tp-card-diff { font-size:.72rem;padding:3px 10px;border-radius:20px;font-weight:600;border:1px solid; }

        .tp-card-icon-wrap { margin-bottom:14px; }
        .tp-card-icon { font-size:2rem; }

        .tp-card-title { font-size:1.05rem;font-weight:700;color:#f1f5f9;margin-bottom:8px;line-height:1.3; }
        .tp-card-desc { font-size:.82rem;color:rgba(255,255,255,.38);margin-bottom:16px;line-height:1.5; }

        .tp-card-meta { display:flex;gap:16px;font-size:.8rem;color:rgba(255,255,255,.3);margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.06); }
        .tp-meta-item {}

        .tp-card-score { margin-bottom:16px; }
        .tp-score-bar-track { height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;margin-bottom:6px; }
        .tp-score-bar-fill { height:100%;border-radius:3px;transition:width 1s ease; }
        .tp-score-row { display:flex;justify-content:space-between;align-items:center; }
        .tp-score-label { font-size:.78rem;color:rgba(255,255,255,.3); }
        .tp-score-value { font-size:.95rem;font-weight:800; }
        .tp-attempts { font-size:.72rem;color:rgba(255,255,255,.25); }

        .tp-card-new { display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:10px; }
        .tp-new-badge { font-size:.75rem;background:rgba(99,102,241,.15);color:#a5b4fc;padding:2px 8px;border-radius:20px;font-weight:700; }
        .tp-new-text { font-size:.78rem;color:rgba(255,255,255,.25); }

        .tp-start-btn { width:100%;padding:11px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--c1),var(--c2));color:white;font-size:.9rem;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px; }
        .tp-start-btn:hover { box-shadow:0 6px 20px rgba(0,0,0,.35);transform:translateY(-1px); }
        .tp-start-btn:disabled { opacity:.6;cursor:not-allowed;transform:none; }

        .tp-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;gap:12px;color:rgba(255,255,255,.3);text-align:center; }
        .tp-empty h3 { font-size:1.2rem;color:rgba(255,255,255,.5);font-weight:700; }
        .tp-empty p { font-size:.9rem; }
        .tp-reset-btn { padding:10px 24px;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;border-radius:12px;font-size:.9rem;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s;margin-top:8px; }
        .tp-reset-btn:hover { background:rgba(99,102,241,.25); }

        @media(max-width:640px) { .tp-main{padding:24px 16px 60px;} .tp-title{font-size:1.8rem;} .tp-header-summary{flex-wrap:wrap;} .tp-summary-stat{padding:0 12px;} }
      `}</style>
    </div>
  );
}
