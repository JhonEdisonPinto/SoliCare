import { Link } from 'react-router-dom';
import type { Alert, Person } from '../data/types';
import { useCare, useCareActions } from '../data/hooks';
import { formatFull, formatWhen, timeAgo } from '../lib/time';
import { Stamp } from './Stamp';
import { useToast } from './Toast';

function When({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={formatFull(iso)}>
      {formatWhen(iso, now)} ({timeAgo(iso, now)})
    </time>
  );
}

/**
 * One open alert as a line of the event log: stamp, time, person, device, age and the single next action.
 * An open fall is the only row with a colored background; connection alerts stay plain.
 */
export function AlertItem({ alert, person, now }: { alert: Alert; person: Person | undefined; now: number }) {
  const actions = useCareActions();
  const { acknowledgements } = useCare();
  const toast = useToast();
  const isFall = alert.kind === 'caida';
  const pending = alert.state === 'pendiente';

  const act = async (kind: 'atender' | 'resolver') => {
    const previous = acknowledgements[alert.id];
    if (kind === 'atender') await actions.acknowledgeAlert(alert.id);
    else await actions.resolveAlert(alert.id);
    toast({
      text: kind === 'atender' ? 'Alerta atendida' : 'Alerta resuelta',
      actionLabel: 'Deshacer',
      onAction: () => void actions.restoreAlertAck(alert.id, previous),
    });
  };

  const stampKind = isFall ? (pending ? 'caida' : 'caida-atendida') : pending ? 'sin-reporte' : 'atendida';
  const contacts = isFall && person ? person.contacts.filter((contact) => contact.phone).slice(0, 2) : [];
  const name = person ? person.name : `Dispositivo ${alert.deviceId}`;

  return (
    <li className={`event event--${alert.kind} event--${alert.state}`}>
      <span className="event-stamp">
        <Stamp kind={stampKind}>{isFall ? 'Caída' : 'Sin reporte'}</Stamp>
      </span>
      <time className="event-time" dateTime={alert.at} title={formatFull(alert.at)}>
        {formatWhen(alert.at, now)}
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
        {alert.deviceId}
      </span>
      <span className="event-age">{timeAgo(alert.at, now)}</span>
      <div className="event-detail">
        <p>
          {isFall ? null : <>Sin reportes del dispositivo desde esa hora. </>}
          {pending ? (
            <>Pendiente: nadie la ha marcado como atendida.</>
          ) : (
            <>
              Atendida <When iso={alert.acknowledgedAt ?? alert.at} now={now} />
              {alert.acknowledgeNote ? `. Nota: ${alert.acknowledgeNote}` : '.'}
            </>
          )}
        </p>
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
      <div className="event-action">
        {pending ? (
          <button type="button" className="key" onClick={() => void act('atender')}>
            Marcar como atendida
            <span className="visually-hidden">: {isFall ? 'caída' : 'sin reporte'} de {name}</span>
          </button>
        ) : (
          <button type="button" className="key" onClick={() => void act('resolver')}>
            Marcar como resuelta
            <span className="visually-hidden">: {isFall ? 'caída' : 'sin reporte'} de {name}</span>
          </button>
        )}
      </div>
    </li>
  );
}
