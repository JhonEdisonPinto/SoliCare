import { useEffect, type ReactNode } from 'react';

/** The view's status line: its title (the page's only h1), the document title, and optional content beside it. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | SoliCare`;
  }, [title]);
  return (
    <div className="status-line">
      <h1 className="view-title">{title}</h1>
      {children}
    </div>
  );
}
