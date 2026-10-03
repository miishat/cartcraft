import { useEffect, useState } from 'react';

const PHONE = '(max-width: 767px)';

function matches(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;
}

/** True below Tailwind's md breakpoint. Menus become bottom sheets there. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE);
    const onChange = () => setPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return phone;
}
