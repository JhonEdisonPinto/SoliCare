import type { ReactNode } from 'react';

/**
 * The header of a card: a small kicker, the title (h2), an optional count and an optional explanation
 * under the title. `actions` sits on the right. The count is read as part of the heading and drawn as a pill.
 */
export function PanelHead({
  id,
  title,
  kicker,
  count,
  note,
  actions,
}: {
  id: string;
  title: string;
  kicker?: string;
  count?: number;
  note?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div className="panel-heading">
        {kicker ? <p className="panel-kicker">{kicker}</p> : null}
        <div className="panel-title-row">
          <h2 id={id} className="panel-title">
            {title}
            {count !== undefined ? <span className="visually-hidden"> ({count})</span> : null}
          </h2>
          {count !== undefined ? (
            <span className="count-pill" aria-hidden="true">
              {count}
            </span>
          ) : null}
        </div>
        {note ? <p className="panel-note">{note}</p> : null}
      </div>
      {actions ? <div className="panel-actions">{actions}</div> : null}
    </div>
  );
}
