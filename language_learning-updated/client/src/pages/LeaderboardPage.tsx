import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Trophy, Medal } from "lucide-react";

export default function LeaderboardPage() {
  const { isAuthenticated } = useAuth();
  const { data: topScorers, isLoading } = trpc.leaderboard.getTopScorers.useQuery({ limit: 50 });

  const getMedalIcon = (position: number) => {
    switch (position) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-12 animate-slideUp">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-8 h-8 text-accent" />
            <h1 className="text-4xl font-bold">Leaderboard</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            See how you rank against other learners. The top scorers are recognized here.
          </p>
        </div>

        {/* Leaderboard Table */}
        <div className="card-elegant overflow-hidden animate-slideUp" style={{ animationDelay: "0.1s" }}>
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin">
                <Trophy className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mt-4">Loading leaderboard...</p>
            </div>
          ) : !topScorers || topScorers.length === 0 ? (
            <div className="p-8 text-center">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No scores yet</h3>
              <p className="text-muted-foreground">
                Start taking quizzes to appear on the leaderboard!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-semibold">Rank</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">User</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Total Score</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">Quizzes Taken</th>
                  </tr>
                </thead>
                <tbody>
                  {topScorers.map((scorer, idx) => {
                    const position = idx + 1;
                    const medal = getMedalIcon(position);

                    return (
                      <tr
                        key={scorer.userId}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                        style={{ animationDelay: `${0.15 + idx * 0.02}s` }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {medal && <span className="text-2xl">{medal}</span>}
                            <span className="font-semibold text-lg">#{position}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium">{scorer.userName || "Anonymous"}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-lg font-bold text-primary">
                            {Math.round(Number(scorer.totalScore || 0))}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-secondary/10 text-secondary font-medium text-sm">
                            {String(scorer.attemptCount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="card-elegant p-6 text-center animate-slideUp" style={{ animationDelay: "0.2s" }}>
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="font-semibold mb-2">How Scoring Works</h3>
            <p className="text-sm text-muted-foreground">
              Your score is calculated as a percentage of correct answers on each quiz.
            </p>
          </div>

          <div className="card-elegant p-6 text-center animate-slideUp" style={{ animationDelay: "0.3s" }}>
            <div className="text-3xl mb-3">📊</div>
            <h3 className="font-semibold mb-2">Total Score</h3>
            <p className="text-sm text-muted-foreground">
              Your total score is the sum of all quiz scores you've achieved.
            </p>
          </div>

          <div className="card-elegant p-6 text-center animate-slideUp" style={{ animationDelay: "0.4s" }}>
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="font-semibold mb-2">Rankings</h3>
            <p className="text-sm text-muted-foreground">
              Top performers are ranked by total score, with ties broken by quiz attempts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
