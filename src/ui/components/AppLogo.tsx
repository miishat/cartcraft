/** The app icon. public/icon.svg has rounded corners of its own (Task 13). */
export function AppLogo({ className = 'h-7 w-7' }: { className?: string }) {
  return <img src="/icon.svg" alt="" className={`${className} rounded-[22%] ring-1 ring-slate-200`} />;
}
