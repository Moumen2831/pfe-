import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Loader2, TrendingUp, Calendar, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";

interface TestResult {
  id: number;
  skill: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  percentage: number;
  timeTaken: number;
  completedAt: Date;
}

export default function TestHistoryPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [selectedSkill, setSelectedSkill] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month" | "year">("all");

  // Mock test history data (replace with real API call)
  const mockTestHistory: TestResult[] = [
    {
      id: 1,
      skill: "listening",
      score: 85,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 245,
      completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: 2,
      skill: "reading",
      score: 92,
      totalQuestions: 5,
      correctAnswers: 5,
      percentage: 100,
      timeTaken: 312,
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: 3,
      skill: "writing",
      score: 78,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 456,
      completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: 4,
      skill: "speaking",
      score: 88,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 234,
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: 5,
      skill: "listening",
      score: 75,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 267,
      completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    {
      id: 6,
      skill: "reading",
      score: 88,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 289,
      completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      id: 7,
      skill: "writing",
      score: 82,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 398,
      completedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    },
    {
      id: 8,
      skill: "speaking",
      score: 80,
      totalQuestions: 5,
      correctAnswers: 4,
      percentage: 80,
      timeTaken: 212,
      completedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    },
  ];

  // Filter results
  const filteredResults = useMemo(() => {
    let filtered = [...mockTestHistory];

    // Filter by skill
    if (selectedSkill !== "all") {
      filtered = filtered.filter((result) => result.skill === selectedSkill);
    }

    // Filter by date range
    const now = new Date();
    const rangeMs =
      dateRange === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : dateRange === "month"
        ? 30 * 24 * 60 * 60 * 1000
        : dateRange === "year"
        ? 365 * 24 * 60 * 60 * 1000
        : Infinity;

    filtered = filtered.filter((result) => now.getTime() - result.completedAt.getTime() <= rangeMs);

    return filtered.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }, [selectedSkill, dateRange]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredResults.map((result) => ({
      date: result.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: result.percentage,
      skill: result.skill,
    }));
  }, [filteredResults]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (filteredResults.length === 0) {
      return { avgScore: 0, bestScore: 0, totalTests: 0, improvementTrend: 0 };
    }

    const scores = filteredResults.map((r) => r.percentage);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const bestScore = Math.max(...scores);
    const totalTests = filteredResults.length;

    // Calculate improvement trend
    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.ceil(scores.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const improvementTrend = Math.round(secondAvg - firstAvg);

    return { avgScore, bestScore, totalTests, improvementTrend };
  }, [filteredResults]);

  // Skill names and colors
  const skillInfo: Record<string, { name: string; color: string; gradient: string }> = {
    listening: { name: "Listening", color: "#06b6d4", gradient: "from-cyan-400 to-blue-500" },
    reading: { name: "Reading", color: "#ec4899", gradient: "from-pink-400 to-rose-500" },
    speaking: { name: "Speaking", color: "#a855f7", gradient: "from-purple-400 to-indigo-500" },
    writing: { name: "Writing", color: "#10b981", gradient: "from-emerald-400 to-teal-500" },
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0a0f1e" }}>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Please log in to view test history</h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="px-6 py-2 bg-cyan-500 text-white rounded-lg font-semibold hover:bg-cyan-600 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-on-surface overflow-hidden" style={{ backgroundColor: "#0a0f1e" }}>
      {/* Background */}
      <div className="fixed top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 blur-[120px] opacity-20 z-0 pointer-events-none"></div>
      <div className="fixed bottom-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 blur-[120px] opacity-20 z-0 pointer-events-none"></div>

      <main className="relative z-10 p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Test History
          </h1>
          <p className="text-on-surface-variant">Track your assessment performance over time</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { label: "Total Tests", value: stats.totalTests, icon: "📊" },
            { label: "Average Score", value: `${stats.avgScore}%`, icon: "📈" },
            { label: "Best Score", value: `${stats.bestScore}%`, icon: "🏆" },
            {
              label: "Trend",
              value: `${stats.improvementTrend > 0 ? "+" : ""}${stats.improvementTrend}%`,
              icon: stats.improvementTrend > 0 ? "📈" : "📉",
            },
          ].map((stat, idx) => (
            <div key={idx} className="glass-card rounded-[2rem] p-6 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-on-surface-variant text-sm mb-2">{stat.label}</p>
                  <p className="text-3xl font-bold text-white">{stat.value}</p>
                </div>
                <span className="text-4xl">{stat.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="glass-card rounded-[2rem] p-6 border border-white/10 mb-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Skill Filter */}
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-3 text-on-surface-variant">
                <Filter className="w-4 h-4 inline mr-2" />
                Filter by Skill
              </label>
              <div className="flex flex-wrap gap-2">
                {["all", "listening", "reading", "speaking", "writing"].map((skill) => (
                  <button
                    key={skill}
                    onClick={() => setSelectedSkill(skill)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      selectedSkill === skill
                        ? `bg-gradient-to-r ${skillInfo[skill]?.gradient || "from-cyan-500 to-blue-500"} text-white shadow-lg`
                        : "bg-white/5 border border-white/10 text-on-surface-variant hover:bg-white/10"
                    }`}
                  >
                    {skill === "all" ? "All Skills" : skillInfo[skill]?.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-3 text-on-surface-variant">
                <Calendar className="w-4 h-4 inline mr-2" />
                Date Range
              </label>
              <div className="flex flex-wrap gap-2">
                {["all", "week", "month", "year"].map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range as any)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      dateRange === range
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                        : "bg-white/5 border border-white/10 text-on-surface-variant hover:bg-white/10"
                    }`}
                  >
                    {range === "all" ? "All Time" : range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        {filteredResults.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Score Trend Chart */}
            <div className="glass-card rounded-[2rem] p-6 border border-white/10">
              <h2 className="text-xl font-bold mb-6 text-white">Score Trend</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(10, 15, 30, 0.9)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    dot={{ fill: "#06b6d4", r: 5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Skill Distribution Chart */}
            <div className="glass-card rounded-[2rem] p-6 border border-white/10">
              <h2 className="text-xl font-bold mb-6 text-white">Skill Performance</h2>
              <div className="space-y-4">
                {Object.entries(skillInfo).map(([skillKey, skillData]) => {
                  const skillResults = filteredResults.filter((r) => r.skill === skillKey);
                  if (skillResults.length === 0) return null;

                  const avgScore = Math.round(
                    skillResults.reduce((sum, r) => sum + r.percentage, 0) / skillResults.length
                  );

                  return (
                    <div key={skillKey}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-white">{skillData.name}</span>
                        <span className="text-cyan-400 font-bold">{avgScore}%</span>
                      </div>
                      <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                        <div
                          className={`h-full bg-gradient-to-r ${skillData.gradient} rounded-full`}
                          style={{ width: `${avgScore}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        <div className="glass-card rounded-[2rem] p-6 border border-white/10">
          <h2 className="text-xl font-bold mb-6 text-white">Recent Tests</h2>

          {filteredResults.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-on-surface-variant text-lg">No tests found for the selected filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-4 font-semibold text-on-surface-variant">Date</th>
                    <th className="text-left py-4 px-4 font-semibold text-on-surface-variant">Skill</th>
                    <th className="text-left py-4 px-4 font-semibold text-on-surface-variant">Score</th>
                    <th className="text-left py-4 px-4 font-semibold text-on-surface-variant">Correct</th>
                    <th className="text-left py-4 px-4 font-semibold text-on-surface-variant">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result) => (
                    <tr key={result.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4 text-white">
                        {result.completedAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold bg-gradient-to-r ${
                            skillInfo[result.skill]?.gradient
                          } text-white`}
                        >
                          {skillInfo[result.skill]?.name}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-2xl font-bold text-cyan-400">{result.percentage}%</span>
                      </td>
                      <td className="py-4 px-4 text-white">
                        {result.correctAnswers}/{result.totalQuestions}
                      </td>
                      <td className="py-4 px-4 text-on-surface-variant">
                        {Math.floor(result.timeTaken / 60)}m {result.timeTaken % 60}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => navigate("/dashboard")}
            className="px-8 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </main>

      {/* Styles */}
      <style>{`
        .glass-card {
          background: rgba(71, 98, 150, 0.35);
          backdrop-filter: blur(24px);
          border-top: 1px solid rgba(147, 172, 216, 0.15);
          border-left: 1px solid rgba(147, 172, 216, 0.15);
        }
      `}</style>
    </div>
  );
}
