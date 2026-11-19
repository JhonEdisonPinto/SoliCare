import type { ReactNode } from 'react';

/** The ruled heading of a block: title, optional count of what it lists, optional note beside it. */
export function BlockHead({ id, title, count, children }: { id: string; title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="block-head">
      <h2 id={id} className="block-title">
        {title}
        {count !== undefined ? <span className="block-count">{count}</span> : null}
      </h2>
      {children ? <p className="block-note">{children}</p> : null}
    </div>
  );
}
