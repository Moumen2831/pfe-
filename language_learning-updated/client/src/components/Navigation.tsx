import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { LogOut, Menu, X, BookOpen, BarChart3, Home as HomeIcon } from "lucide-react";
import { useState } from "react";

export default function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 bg-background border-b border-border shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-gradient">
            <BookOpen className="w-6 h-6" />
            <span>LinguaFlow</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/lessons" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Lessons
            </Link>
            {isAuthenticated && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                  Dashboard
                </Link>
                <Link href="/leaderboard" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                  Leaderboard
                </Link>
              </>
            )}
          </div>

          {/* Auth Section */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  Welcome, <span className="font-semibold text-foreground">{user?.name}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </div>
            ) : (
              <Button asChild size="sm">
                <a href={getLoginUrl()}>Login</a>
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-border space-y-3 animate-slideDown">
            <Link href="/lessons" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors">
              Lessons
            </Link>
            {isAuthenticated && (
              <>
                <Link href="/dashboard" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors">
                  Dashboard
                </Link>
                <Link href="/leaderboard" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors">
                  Leaderboard
                </Link>
              </>
            )}
            <div className="px-4 py-3 border-t border-border">
              {isAuthenticated ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Welcome, <span className="font-semibold text-foreground">{user?.name}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </Button>
                </div>
              ) : (
                <Button asChild size="sm" className="w-full">
                  <a href={getLoginUrl()}>Login</a>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
