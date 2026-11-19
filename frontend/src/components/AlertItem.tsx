import { AlertTriangle, CheckCircle2, WifiOff } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Alert, Person } from '../data/types';
import { formatFull, formatWhen, timeAgo } from '../lib/time';
import { Pill, type PillTone } from './Pill';
import { useAlertActions } from './useAlertActions';

function When({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={formatFull(iso)}>
      {formatWhen(iso, now)} ({timeAgo(iso, now)})
    </time>
  );
}

type Props = {
  alert: Alert;
  person: Person | undefined;
  now: number;
  /** Offers "Añadir nota" so a pending alert can be acknowledged with a note. */
  withNote?: boolean;
  /** Called after an action succeeds, so a list that filters by state can move focus when the row leaves it. */
  onActed?: () => void;
};

/**
 * One alert as a card: icon, what happened, who and when, the state, and the single next action. An open
 * fall is the only card with a red tint; connection alerts are amber; resolved alerts stay readable but
 * offer no action. A simulated fall ("Simular caída") is labelled as such and offers no action either.
 */
export function AlertItem({ alert, person, now, withNote = false, onActed }: Props) {
  const act = useAlertActions(alert);
  const noteId = useId();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const item = useRef<HTMLLIElement>(null);
  const key = useRef<HTMLButtonElement>(null);
  const noteToggle = useRef<HTMLButtonElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const refocus = useRef(false);

  const isFall = alert.kind === 'caida';
  const pending = alert.state === 'pendiente';
  const resolved = alert.state === 'resuelta';

  useEffect(() => {
    // After an action the key that was pressed is replaced; keep keyboard focus inside the card.
    if (!refocus.current) return;
    refocus.current = false;
    (key.current ?? item.current)?.focus();
  }, [alert.state]);

  useEffect(() => {
    if (noteOpen) noteField.current?.focus();
  }, [noteOpen]);

  const run = async (kind: 'atender' | 'resolver', text?: string) => {
    refocus.current = true;
    await act(kind, text);
    setNoteOpen(false);
    setNote('');
    onActed?.();
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    void run('atender', note);
  };

  const closeNote = () => {
    setNoteOpen(false);
    setNote('');
    noteToggle.current?.focus();
  };

  const tone: PillTone = resolved ? 'neutral' : pending ? (isFall ? 'danger' : 'warn') : 'info';
  const stateLabel = resolved ? 'Resuelta' : pending ? 'Pendiente' : 'Atendida';
  const name = person ? person.name : `Dispositivo ${alert.deviceId}`;
  const subject = `${isFall ? 'caída' : 'sin reporte'} de ${name}`;
  const Icon = resolved ? CheckCircle2 : isFall ? AlertTriangle : WifiOff;

  return (
    <li ref={item} tabIndex={-1} className={`event event--${alert.kind} event--${alert.state}`}>
      <span className="event-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="event-main">
        <div className="event-head">
          <strong className="event-title">{isFall ? 'Caída' : 'Sin reporte'}</strong>
          <Pill tone={tone}>{stateLabel}</Pill>
          {alert.simulated ? <Pill tone="neutral">Simulación</Pill> : null}
        </div>
        <p className="event-subject">
          {person ? (
            <Link className="event-name" to={`/personas/${person.id}`}>
              {person.name}
            </Link>
          ) : (
            <Link className="event-name" to={`/dispositivos/${encodeURIComponent(alert.deviceId)}`}>
              {name}
            </Link>
          )}
          {person?.relation ? <span className="event-relation"> · {person.relation}</span> : null}
          {person ? (
            // Without a person the name already is "Dispositivo <id>", so the id is not repeated.
            <span className="event-device">
              {' '}
              · <span className="visually-hidden">Dispositivo </span>
              <Link to={`/dispositivos/${encodeURIComponent(alert.deviceId)}`}>{alert.deviceId}</Link>
            </span>
          ) : null}
        </p>
        <p className="event-time">
          <time dateTime={alert.at} title={formatFull(alert.at)}>
            {formatWhen(alert.at, now)}
          </time>{' '}
          <span className="event-age">({timeAgo(alert.at, now)})</span>
        </p>
        <div className="event-detail">
          {alert.acknowledgedAt ? (
            <p>
              Atendida <When iso={alert.acknowledgedAt} now={now} />.
              {alert.acknowledgeNote ? <span className="event-note-text"> Nota: {alert.acknowledgeNote}</span> : null}
            </p>
          ) : null}
          {resolved ? (
            <p>
              Resuelta <When iso={alert.resolvedAt ?? alert.at} now={now} />
              {alert.resolvedBy === 'datos' ? ': el dispositivo volvió a reportar.' : '.'}
              {alert.resolveNote ? <span className="event-note-text"> Nota: {alert.resolveNote}</span> : null}
            </p>
          ) : null}
          {alert.simulated ? <p>Simulación: los avisos van al grupo de Telegram y la persona vuelve a estar bien en unos segundos.</p> : null}
        </div>
      </div>
      {!resolved && !alert.simulated ? (
        <div className="event-action">
          <button ref={key} type="button" className={pending ? 'btn btn--primary' : 'btn btn--outline'} onClick={() => void run(pending ? 'atender' : 'resolver')}>
            {pending ? 'Marcar como atendida' : 'Marcar como resuelta'}
            <span className="visually-hidden">: {subject}</span>
          </button>
          {withNote && pending ? (
            <button
              ref={noteToggle}
              type="button"
              className="text-button"
              aria-expanded={noteOpen}
              aria-controls={noteId}
              onClick={() => (noteOpen ? closeNote() : setNoteOpen(true))}
            >
              Añadir nota<span className="visually-hidden">: {subject}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {noteOpen ? (
        <form id={noteId} className="event-note" onSubmit={submitNote}>
          <div className="field">
            <label className="field-label" htmlFor={`${noteId}-text`}>
              Nota (opcional)
            </label>
            <p className="field-hint" id={`${noteId}-hint`}>
              Por ejemplo, a quién llamó o qué encontró. Quedará guardada en este navegador.
            </p>
            <textarea
              id={`${noteId}-text`}
              ref={noteField}
              className="control"
              name="note"
              rows={2}
              maxLength={280}
              value={note}
              aria-describedby={`${noteId}-hint`}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary">
              Atender con nota<span className="visually-hidden">: {subject}</span>
            </button>
            <button type="button" className="text-button" onClick={closeNote}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
