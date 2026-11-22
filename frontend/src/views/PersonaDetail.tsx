import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertItem } from '../components/AlertItem';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SelectField, TextField } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { PanelHead } from '../components/PanelHead';
import { PersonForm } from '../components/PersonForm';
import { ReadingAge } from '../components/ReadingAge';
import { StatusPillFor } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { VitalsPanel } from '../components/VitalsPanel';
import { useAlerts, useCare, useCareActions, useDeviceHistory, useNow, usePeopleSummary, useReferenceNow, useTelemetry } from '../data/hooks';
import { assignableDevices } from '../data/summary';
import { avatarTone, initials } from '../lib/people';
import type { EmergencyContact, Person } from '../data/types';
import type { LatestVital } from '../lib/vitals';
import { text, useForm } from '../lib/useForm';
import { formatFull, formatWhen, timeAgo } from '../lib/time';

function VitalInline({ label, vital, unit }: { label: string; vital: LatestVital; unit: string }) {
  return (
    <span className="vital-inline">
      {label}{' '}
      {vital ? (
        <>
          <span className="vital-value">{vital.value}</span> {unit}
        </>
      ) : (
        <span className="vital-missing vital-missing--inline">Sin lectura válida</span>
      )}
    </span>
  );
}

function ContactForm({ personId, contact, onDone, onCancel }: { personId: string; contact?: EmergencyContact; onDone: (id: string) => void; onCancel: () => void }) {
  const actions = useCareActions();
  const toast = useToast();
  const { formRef, errors, general, pending, onSubmit, onInput } = useForm(async (data) => {
    const input = { name: text(data, 'name'), relation: text(data, 'relation'), phone: text(data, 'phone') };
    const saved = contact ? await actions.updateContact(personId, contact.id, input) : await actions.addContact(personId, input);
    toast({ text: 'Contacto guardado' });
    onDone(saved.id);
  });
  return (
    <form ref={formRef} className="form" noValidate onSubmit={onSubmit} onInput={onInput}>
      <TextField label="Nombre del contacto" name="name" defaultValue={contact?.name} error={errors.name} autoComplete="off" autoFocus />
      <TextField label="Relación (opcional)" name="relation" defaultValue={contact?.relation} error={errors.relation} hint="Por ejemplo Hijo o Vecina." autoComplete="off" />
      <TextField
        label="Teléfono"
        name="phone"
        type="tel"
        inputMode="tel"
        defaultValue={contact?.phone}
        error={errors.phone}
        hint="Con indicativo si es de otro país, por ejemplo +57 300 555 0100."
        autoComplete="off"
      />
      {general ? (
        <p className="form-error" role="alert">
          {general}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          Guardar contacto
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ContactsBlock({ person }: { person: Person }) {
  const actions = useCareActions();
  const toast = useToast();
  /** A contact id while editing it, "new" while adding, null otherwise. */
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<EmergencyContact | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const addKey = useRef<HTMLButtonElement>(null);
  const back = useRef<string | null>(null);

  useEffect(() => {
    // When a form closes, focus goes back to the control that opened it (or to "Añadir contacto").
    if (editing !== null || back.current === null) return;
    const target = back.current === 'new' ? addKey.current : list.current?.querySelector<HTMLElement>(`[data-edit="${back.current}"]`);
    (target ?? addKey.current)?.focus();
    back.current = null;
  }, [editing]);

  const close = (focusId: string) => {
    back.current = focusId;
    setEditing(null);
  };

  const remove = async (contact: EmergencyContact) => {
    await actions.removeContact(person.id, contact.id);
    setRemoving(null);
    toast({ text: 'Contacto eliminado' });
    // After the dialog has closed and given focus back to the (removed) opener.
    requestAnimationFrame(() => addKey.current?.focus());
  };

  return (
    <section className="panel" aria-labelledby="contactos">
      <PanelHead
        id="contactos"
        kicker="Emergencias"
        title="Contactos que serán notificados"
        count={person.contacts.length}
        note="Por ahora SoliCare no avisa a estos contactos de una caída real. En las simulaciones, los tres primeros con teléfono aparecen como contactos del caso en el grupo de Telegram."
        actions={
          <button ref={addKey} type="button" className="btn btn--outline" aria-expanded={editing === 'new'} onClick={() => setEditing(editing === 'new' ? null : 'new')}>
            <Plus size={16} aria-hidden="true" /> Añadir contacto
          </button>
        }
      />
      {person.contacts.length === 0 && editing !== 'new' ? (
        <p className="panel-empty">Esta persona no tiene contactos de emergencia. Añade a quien debe recibir la llamada si hay una caída.</p>
      ) : (
        <ul className="contact-list" ref={list}>
          {person.contacts.map((contact) =>
            editing === contact.id ? (
              <li key={contact.id} className="contact contact--editing">
                <ContactForm personId={person.id} contact={contact} onDone={() => close(contact.id)} onCancel={() => close(contact.id)} />
              </li>
            ) : (
              <li key={contact.id} className="contact">
                <span className={`person-avatar person-avatar--${avatarTone(contact.id)}`} aria-hidden="true">
                  {initials(contact.name)}
                </span>
                <span className="contact-who">
                  <span className="contact-name">{contact.name}</span>
                  <span className="contact-relation">{contact.relation}</span>
                </span>
                <span className="contact-phone">{contact.phone}</span>
                <span className="contact-actions">
                  <button type="button" className="btn btn--outline btn--small" data-edit={contact.id} onClick={() => setEditing(contact.id)}>
                    Editar<span className="visually-hidden"> a {contact.name}</span>
                  </button>
                  <button type="button" className="text-button" onClick={() => setRemoving(contact)}>
                    Eliminar<span className="visually-hidden"> a {contact.name}</span>
                  </button>
                </span>
              </li>
            ),
          )}
          {editing === 'new' ? (
            <li className="contact contact--editing">
              <ContactForm personId={person.id} onDone={() => close('new')} onCancel={() => close('new')} />
            </li>
          ) : null}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `¿Eliminar a ${removing.name}?` : ''}
        confirmLabel="Eliminar contacto"
        onConfirm={() => (removing ? remove(removing) : undefined)}
        onCancel={() => setRemoving(null)}
      >
        <p>Dejará de aparecer entre los contactos de {person.name}. Esta acción no se puede deshacer.</p>
      </ConfirmDialog>
    </section>
  );
}

function DeviceAssignment({ person }: { person: Person }) {
  const actions = useCareActions();
  const { people } = useCare();
  const { devices } = useTelemetry();
  const toast = useToast();
  const options = assignableDevices(people, devices, person.id);
  const { formRef, errors, general, pending, onSubmit, onInput } = useForm(async (data) => {
    await actions.updatePerson(person.id, { deviceId: text(data, 'deviceId') || null });
    toast({ text: 'Dispositivo guardado' });
  });
  return (
    <form ref={formRef} className="form form--inline" noValidate onSubmit={onSubmit} onInput={onInput}>
      <SelectField
        label="Dispositivo asignado"
        name="deviceId"
        key={person.deviceId ?? 'none'}
        defaultValue={person.deviceId ?? ''}
        error={errors.deviceId}
        hint="Elige otro para cambiarlo, o Sin dispositivo para quitarlo. Solo aparecen dispositivos que el servidor ya conoce y que nadie más tiene."
      >
        <option value="">Sin dispositivo</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </SelectField>
      {general ? (
        <p className="form-error" role="alert">
          {general}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          Guardar dispositivo
        </button>
      </div>
    </form>
  );
}

export function PersonaDetail() {
  const { personId = '' } = useParams();
  const navigate = useNavigate();
  const actions = useCareActions();
  const toast = useToast();
  const { people } = useCare();
  const summary = usePeopleSummary();
  const telemetry = useTelemetry();
  const { alerts } = useAlerts();
  const now = useReferenceNow();
  const clock = useNow();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [limit, setLimit] = useState(300);
  const editKey = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const deleted = useRef(false);

  const person = people.find((item) => item.id === personId);
  const history = useDeviceHistory(person?.deviceId, limit);

  useEffect(() => {
    if (wasEditing.current && !editing) editKey.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (!person) {
    if (deleted.current) return null;
    return (
      <>
        <PageHeader title="Persona no encontrada" />
        <p className="panel panel-empty">
          Esta persona ya no existe en este navegador. <Link to="/personas">Ver todas las personas</Link>
        </p>
      </>
    );
  }

  const row = summary.people.find((item) => item.person.id === person.id);
  const known = telemetry.lastSuccessAt !== null;
  // History belongs to the person recorded when each alert was first seen, not to whoever has the device now.
  const personAlerts = alerts.filter((alert) => alert.personId === person.id);
  const device = row?.device;

  const remove = async () => {
    deleted.current = true;
    await actions.removePerson(person.id);
    setConfirming(false);
    toast({ text: 'Persona eliminada' });
    navigate('/personas');
  };

  return (
    <>
      <p className="back-link">
        <Link to="/personas">
          <ChevronLeft size={15} aria-hidden="true" /> Todas las personas
        </Link>
      </p>
      <PageHeader eyebrow="Persona" title={person.name} subtitle={<p>{person.relation || 'Sin relación indicada'}</p>}>
        <button ref={editKey} type="button" className="btn btn--primary" aria-expanded={editing} aria-controls="editar-persona" onClick={() => setEditing((value) => !value)}>
          <Pencil size={16} aria-hidden="true" /> Editar datos
        </button>
        <button type="button" className="btn btn--danger-outline" onClick={() => setConfirming(true)}>
          <Trash2 size={16} aria-hidden="true" /> Eliminar persona
        </button>
      </PageHeader>

      {editing ? (
        <section className="panel" id="editar-persona" aria-labelledby="editar-titulo">
          <PanelHead id="editar-titulo" title="Editar datos" kicker="Persona" />
          <PersonForm person={person} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        </section>
      ) : null}

      <section className="panel" aria-labelledby="dispositivo">
        <PanelHead id="dispositivo" title="Dispositivo" kicker="Seguimiento" />
        {person.deviceId ? (
          <dl className="facts">
            <div className="fact">
              <dt>Dispositivo</dt>
              <dd>
                <Link to={`/dispositivos/${encodeURIComponent(person.deviceId)}`}>{person.deviceId}</Link>
              </dd>
            </div>
            <div className="fact">
              <dt>Estado</dt>
              <dd>
                <StatusPillFor status={row?.status ?? 'nunca'} lastSeenAt={device?.last_seen_at} known={known} now={now} />
              </dd>
            </div>
            <div className="fact">
              <dt>Último reporte</dt>
              <dd>
                {device ? (
                  <time dateTime={device.last_seen_at} title={formatFull(device.last_seen_at)}>
                    {formatWhen(device.last_seen_at, clock)} ({timeAgo(device.last_seen_at, now)})
                  </time>
                ) : (
                  <span className="muted">{known ? 'El servidor no ha recibido reportes de este dispositivo.' : 'Esperando datos del servidor.'}</span>
                )}
              </dd>
            </div>
            {device && row ? (
              <div className="fact">
                <dt>Últimas lecturas válidas</dt>
                <dd className="fact-vitals">
                  <VitalInline label="Pulso" vital={row.pulso} unit="lpm" />
                  <VitalInline label="SpO2" vital={row.spo2} unit="%" />
                  <ReadingAge pulso={row.pulso} spo2={row.spo2} now={now} />
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="panel-empty">Esta persona no tiene un dispositivo asignado, así que SoliCare no puede mostrar su estado ni sus lecturas.</p>
        )}
        <DeviceAssignment person={person} />
      </section>

      <section className="panel" aria-labelledby="senales">
        <PanelHead id="senales" title="Pulso y SpO2" kicker="Seguimiento" />
        {person.deviceId ? (
          <VitalsPanel history={history} limit={limit} onLimitChange={setLimit} />
        ) : (
          <p className="panel-empty">Asigna un dispositivo para ver aquí el historial de pulso y SpO2.</p>
        )}
      </section>

      <ContactsBlock person={person} />

      <section className="panel" aria-labelledby="historial">
        <PanelHead id="historial" title="Historial de alertas" kicker="Seguridad" count={personAlerts.length} />
        {personAlerts.length > 0 ? (
          <ul className="event-log">
            {personAlerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} person={person} now={clock} />
            ))}
          </ul>
        ) : (
          <p className="panel-empty">
            {person.deviceId ? 'No se han detectado caídas ni interrupciones en los reportes de su dispositivo.' : 'Sin dispositivo ni alertas anteriores que mostrar.'}
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        title={`¿Eliminar a ${person.name}?`}
        confirmLabel="Eliminar persona"
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        <p>
          Se borrarán sus datos y sus {person.contacts.length} {person.contacts.length === 1 ? 'contacto' : 'contactos'} de este navegador.
          {person.deviceId ? ` El dispositivo ${person.deviceId} quedará sin persona asignada; el servidor conserva sus lecturas.` : ''} Esta acción no se
          puede deshacer.
        </p>
      </ConfirmDialog>
    </>
  );
}
