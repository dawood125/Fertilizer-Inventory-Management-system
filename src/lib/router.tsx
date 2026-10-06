import { type ReactNode, useEffect, useState, useCallback } from 'react';

const getRoutePath = () => (window.location.hash.slice(1) || '/').split('?')[0] || '/';

export function useHashRoute(): [string, (path: string) => void] {
  const [route, setRoute] = useState(getRoutePath);

  useEffect(() => {
    const handler = () => setRoute(getRoutePath());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((path: string) => {
    window.location.hash = path;
  }, []);

  return [route, navigate];
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Link({ to, children, className, onClick }: LinkProps) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
