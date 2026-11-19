import { Phone, TriangleAlert, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Alert, Person } from '../data/types';
import { useCare, useCareActions } from '../data/hooks';
import { formatFull, formatWhen, timeAgo } from '../lib/time';
import { useToast } from './Toast';

function subjectName(alert: Alert, person: Person | undefined): string {
  return person ? person.name : `Dispositivo ${alert.deviceId}`;
}

function When({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={formatFull(iso)}>
      {timeAgo(iso, now)} ({formatWhen(iso, now)})
    </time>
  );
}

/**
 * One open alert with its single next action. Falls render as the full-bleed band (the only loud element
 * in the product); connection alerts as a quiet row with an amber rule.
 */
export function AlertItem({ alert, person, now }: { alert: Alert; person: Person | undefined; now: number }) {
  const actions = useCareActions();
  const { acknowledgements } = useCare();
  const toast = useToast();
  const name = subjectName(alert, person);
  const isFall = alert.kind === 'caida';

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

  const title = isFall ? `Caída detectada: ${name}` : `Sin reporte reciente: ${name}`;
  const contacts = isFall && person ? person.contacts.filter((contact) => contact.phone).slice(0, 2) : [];

  return (
    <li className={isFall ? 'fall-band' : 'alert-row'}>
      <div className="alert-icon" aria-hidden="true">
        {isFall ? <TriangleAlert /> : <WifiOff />}
      </div>
      <div className="alert-body">
        <h3 className="alert-title">{title}</h3>
        <p className="alert-meta">
          {isFall ? (
            <>
              Detectada <When iso={alert.at} now={now} /> por el dispositivo {alert.deviceId}.
            </>
          ) : (
            <>
              El dispositivo {alert.deviceId} reportó por última vez <When iso={alert.at} now={now} />.
            </>
          )}
        </p>
        <p className="alert-state">
          {alert.state === 'pendiente' ? (
            'Nadie la ha marcado como atendida.'
          ) : (
            <>
              Atendida <When iso={alert.acknowledgedAt ?? alert.at} now={now} />
              {alert.acknowledgeNote ? `. Nota: ${alert.acknowledgeNote}` : '.'}
            </>
          )}
        </p>
        {contacts.length > 0 ? (
          <ul className="alert-contacts" aria-label={`Contactos de emergencia de ${name}`}>
            {contacts.map((contact) => (
              <li key={contact.id}>
                <a className="contact-link" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
                  <Phone aria-hidden="true" className="icon" />
                  Llamar a {contact.name}
                  {contact.relation ? ` (${contact.relation.toLowerCase()})` : ''}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="alert-actions">
        {alert.state === 'pendiente' ? (
          <button type="button" className="button button--primary" onClick={() => void act('atender')}>
            Marcar como atendida
          </button>
        ) : (
          <button type="button" className="button button--primary" onClick={() => void act('resolver')}>
            Marcar como resuelta
          </button>
        )}
        {person ? (
          <Link className="button button--quiet" to={`/personas/${person.id}`}>
            Ver a {person.name.split(' ')[0]}
          </Link>
        ) : (
          <Link className="button button--quiet" to={`/dispositivos/${encodeURIComponent(alert.deviceId)}`}>
            Ver dispositivo
          </Link>
        )}
      </div>
    </li>
  );
}
