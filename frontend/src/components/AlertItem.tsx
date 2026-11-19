import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Alert, Person } from '../data/types';
import { useCare, useCareActions } from '../data/hooks';
import { formatFull, formatWhen, formatWhenParts, timeAgo } from '../lib/time';
import { Stamp, type StampKind } from './Stamp';
import { useToast } from './Toast';

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
  /** Offers "Agregar nota" so a pending alert can be acknowledged with a note. */
  withNote?: boolean;
  /** Called after an action succeeds, so a list that filters by state can move focus when the row leaves it. */
  onActed?: () => void;
};

/**
 * One alert as a line of the event log: stamp, time, person, device, age and the single next action.
 * An open fall is the only row with a colored background; connection alerts stay plain. Resolved alerts
 * stay readable but offer no action.
 */
export function AlertItem({ alert, person, now, withNote = false, onActed }: Props) {
  const actions = useCareActions();
  const { acknowledgements } = useCare();
  const toast = useToast();
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
    // After an action the key that was pressed is replaced; keep keyboard focus inside the row.
    if (!refocus.current) return;
    refocus.current = false;
    (key.current ?? item.current)?.focus();
  }, [alert.state]);

  useEffect(() => {
    if (noteOpen) noteField.current?.focus();
  }, [noteOpen]);

  const act = async (kind: 'atender' | 'resolver', text?: string) => {
    const previous = acknowledgements[alert.id];
    refocus.current = true;
    if (kind === 'atender') await actions.acknowledgeAlert(alert.id, text);
    else await actions.resolveAlert(alert.id);
    setNoteOpen(false);
    setNote('');
    toast({
      text: kind === 'atender' ? 'Alerta atendida' : 'Alerta resuelta',
      actionLabel: 'Deshacer',
      onAction: () => void actions.restoreAlertAck(alert.id, previous),
    });
    onActed?.();
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    void act('atender', note);
  };

  const closeNote = () => {
    setNoteOpen(false);
    setNote('');
    noteToggle.current?.focus();
  };

  const stampKind: StampKind = resolved ? 'atendida' : isFall ? (pending ? 'caida' : 'caida-atendida') : pending ? 'sin-reporte' : 'atendida';
  const contacts = isFall && !resolved && person ? person.contacts.filter((contact) => contact.phone).slice(0, 2) : [];
  const name = person ? person.name : `Dispositivo ${alert.deviceId}`;
  const subject = `${isFall ? 'caída' : 'sin reporte'} de ${name}`;
  const when = formatWhenParts(alert.at, now);

  return (
    <li ref={item} tabIndex={-1} className={`event event--${alert.kind} event--${alert.state}`}>
      <span className="event-stamp">
        <Stamp kind={stampKind}>{isFall ? 'Caída' : 'Sin reporte'}</Stamp>
      </span>
      <time className="event-time" dateTime={alert.at} title={formatFull(alert.at)}>
        {when.day && <span className="event-day">{when.day}</span>}
        <span className="event-clock">{when.time}</span>
      </time>
      <span className="event-subject">
        {person ? (
          <Link className="event-name" to={`/personas/${person.id}`}>
            {person.name}
          </Link>
        ) : (
          <Link className="event-name" to={`/dispositivos/${encodeURIComponent(alert.deviceId)}`}>
            {name}
          </Link>
        )}
        {person?.relation ? <span className="event-relation">{person.relation}</span> : null}
      </span>
      <span className="event-device">
        <span className="visually-hidden">Dispositivo </span>
        <Link to={`/dispositivos/${encodeURIComponent(alert.deviceId)}`}>{alert.deviceId}</Link>
      </span>
      <span className="event-age">{timeAgo(alert.at, now)}</span>
      <div className="event-detail">
        {!isFall ? <p>Sin reportes del dispositivo desde esa hora.</p> : null}
        {pending ? <p>Pendiente: nadie la ha marcado como atendida.</p> : null}
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
        {contacts.length > 0 ? (
          <p className="event-contacts">
            <span className="event-contacts-label">Llamar:</span>
            {contacts.map((contact) => (
              <a key={contact.id} className="contact-link" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
                {contact.name}
                {contact.relation ? ` (${contact.relation.toLowerCase()})` : ''}{' '}
                <span className="contact-phone">{contact.phone}</span>
              </a>
            ))}
          </p>
        ) : null}
      </div>
      {!resolved ? (
        <div className="event-action">
          <button ref={key} type="button" className="key" onClick={() => void act(pending ? 'atender' : 'resolver')}>
            {pending ? 'Marcar como atendida' : 'Marcar como resuelta'}
            <span className="visually-hidden">: {subject}</span>
          </button>
          {withNote && pending ? (
            <button
              ref={noteToggle}
              type="button"
              className="link-action"
              aria-expanded={noteOpen}
              aria-controls={noteId}
              onClick={() => (noteOpen ? closeNote() : setNoteOpen(true))}
            >
              Agregar nota<span className="visually-hidden">: {subject}</span>
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
            <button type="submit" className="key">
              Atender con nota<span className="visually-hidden">: {subject}</span>
            </button>
            <button type="button" className="link-action" onClick={closeNote}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
