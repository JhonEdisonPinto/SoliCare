import { useEffect, type ReactNode } from 'react';

/**
 * The top of a page: a small eyebrow, the title (the page's only h1, also the document title), an
 * optional subtitle and the page actions on the right.
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  documentTitle,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  /** Plain text for the browser tab when `title` is not a string. */
  documentTitle?: string;
  children?: ReactNode;
}) {
  const tabTitle = documentTitle ?? (typeof title === 'string' ? title : 'SoliCare');
  useEffect(() => {
    document.title = `${tabTitle} | SoliCare`;
  }, [tabTitle]);
  return (
    <div className="page-head">
      <div className="page-head-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <div className="page-sub">{subtitle}</div> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </div>
  );
}
