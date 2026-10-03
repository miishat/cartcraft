import { BookOpen, ListChecks, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { AppLogo } from './components/AppLogo';
import { IosInstallBanner } from './components/IosInstallBanner';

const TABS = [
  { to: '/', label: 'Recipes', icon: BookOpen, end: true },
  { to: '/lists', label: 'Lists', icon: ListChecks, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const;

/** Logo and tabs across the top on desktop; on phones each screen has its own header and the tabs sit at the bottom. */
export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 hidden border-b border-slate-200 bg-white/90 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <AppLogo /> CartCraft
          </NavLink>
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {TABS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `rounded-full px-4 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] md:py-6 md:pb-10">
        <IosInstallBanner />
        <Outlet />
      </main>

      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center text-xs ${isActive ? 'text-emerald-800' : 'text-slate-500'}`}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
