import { type ReactNode, useEffect, useState, useCallback } from 'react';

export function useHashRoute(): [string, (path: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');

  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || '/');
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
