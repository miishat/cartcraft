/** Inline error next to the action that failed. Renders nothing without a message. */
export function ErrorNote({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`text-sm text-red-700 ${className}`}>
      {message}
    </p>
  );
}
