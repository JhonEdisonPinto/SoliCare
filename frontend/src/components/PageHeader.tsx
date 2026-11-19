import { useEffect, type ReactNode } from 'react';

/** View title (the page's only h1) and the document title, plus optional content beside it. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | SoliCare`;
  }, [title]);
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {children ? <div className="page-header-aside">{children}</div> : null}
    </div>
  );
}
