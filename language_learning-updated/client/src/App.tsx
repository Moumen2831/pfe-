import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import LessonsPage from "./pages/LessonsPage";
import LessonDetailPage from "./pages/LessonDetailPage";
import QuizPage from "./pages/QuizPage";
import DashboardPage from "./pages/DashboardPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import TestPage from "./pages/TestPage";
import AssessmentPage from "./pages/AssessmentPage";
import TestHistoryPage from "./pages/TestHistoryPage";
import IeltsTestPage from "./pages/IeltsTestPage";
import LoginPage from "./pages/LoginPage";
import Navigation from "./components/Navigation";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/lessons"} component={LessonsPage} />
      <Route path={"/lesson/:id"} component={LessonDetailPage} />
      <Route path={"/quiz/:lessonId"} component={QuizPage} />
      <Route path={"/dashboard"} component={DashboardPage} />
      <Route path={"/test"} component={TestPage} />
      <Route path="/assessment" component={AssessmentPage} />
      <Route path="/tcf" component={AssessmentPage} />
      <Route path="/test-history" component={TestHistoryPage} />
      <Route path="/ielts-test" component={IeltsTestPage} />
      <Route path={"/leaderboard"} component={LeaderboardPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  // Hide navigation on the login page and IELTS test page for clean UX
  const hideNav = location === "/login" || location === "/ielts-test";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideNav && <Navigation />}
      <main className="flex-1">
        <Router />
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
