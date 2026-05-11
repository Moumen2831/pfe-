import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { BookOpen, Zap, Trophy, TrendingUp, ArrowRight } from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center animate-slideUp">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Master Languages with <span className="text-gradient">Elegance</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Learn vocabulary, master grammar, and track your progress with our beautifully designed language learning platform. Structured lessons, interactive quizzes, and achievement badges await.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <>
                  <Button asChild size="lg" className="gap-2">
                    <Link href="/lessons">
                      Start Learning
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/dashboard">View Dashboard</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg" className="gap-2">
                    <a href={getLoginUrl()}>
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/lessons">Browse Lessons</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why Choose LinguaFlow?</h2>
            <p className="text-lg text-muted-foreground">Everything you need for effective language learning</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="card-elegant p-6 animate-slideIn">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Structured Lessons</h3>
              <p className="text-sm text-muted-foreground">
                Carefully organized lessons covering vocabulary, grammar, and pronunciation at all levels.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card-elegant p-6 animate-slideIn" style={{ animationDelay: "0.1s" }}>
              <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Interactive Quizzes</h3>
              <p className="text-sm text-muted-foreground">
                Test your knowledge with multiple-choice and fill-in-the-blank questions with instant feedback.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card-elegant p-6 animate-slideIn" style={{ animationDelay: "0.2s" }}>
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Achievements</h3>
              <p className="text-sm text-muted-foreground">
                Earn badges and compete on the leaderboard to stay motivated and engaged.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="card-elegant p-6 animate-slideIn" style={{ animationDelay: "0.3s" }}>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Progress Tracking</h3>
              <p className="text-sm text-muted-foreground">
                Monitor your learning journey with detailed progress metrics and learning streaks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Begin Your Learning Journey?</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of learners who are mastering languages with LinguaFlow. Start today and see your progress grow.
            </p>
            {!isAuthenticated && (
              <Button asChild size="lg" className="gap-2">
                <a href={getLoginUrl()}>
                  Start Learning Now
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
