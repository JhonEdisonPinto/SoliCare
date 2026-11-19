import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TextField } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { PanelHead } from '../components/PanelHead';
import { useToast } from '../components/Toast';
import { useAlerts, useCare, useCareActions, useTelemetry } from '../data/hooks';
import { SETTINGS_LIMITS } from '../data/store';
import { DEFAULT_SETTINGS } from '../data/types';
import { text, useForm } from '../lib/useForm';

export function Configuracion() {
  const actions = useCareActions();
  const toast = useToast();
  const care = useCare();
  const { alerts } = useAlerts();
  const { source } = useTelemetry();
  const [offline, setOffline] = useState(String(care.settings.offlineWindowMinutes));
  const [poll, setPoll] = useState(String(care.settings.pollIntervalSeconds));
  const [confirming, setConfirming] = useState(false);
  const demo = source.kind === 'demo';

  const { formRef, errors, general, pending, onSubmit, onInput } = useForm(async (data) => {
    await actions.updateSettings({
      offlineWindowMinutes: Number(text(data, 'offlineWindowMinutes')),
      pollIntervalSeconds: Number(text(data, 'pollIntervalSeconds')),
    });
    toast({ text: 'Ajustes guardados' });
  });

  const restore = async () => {
    await actions.updateSettings(DEFAULT_SETTINGS);
    setOffline(String(DEFAULT_SETTINGS.offlineWindowMinutes));
    setPoll(String(DEFAULT_SETTINGS.pollIntervalSeconds));
    toast({ text: 'Valores restablecidos' });
  };

  const wipe = async () => {
    await actions.reset();
    setConfirming(false);
    setOffline(String(DEFAULT_SETTINGS.offlineWindowMinutes));
    setPoll(String(DEFAULT_SETTINGS.pollIntervalSeconds));
    toast({ text: 'Datos locales borrados' });
  };

  const contacts = care.people.reduce((total, person) => total + person.contacts.length, 0);
  const notes = Object.values(care.acknowledgements).filter((ack) => ack.acknowledgeNote || ack.resolveNote).length;
  const { offlineWindowMinutes: win, pollIntervalSeconds: pollLimits } = SETTINGS_LIMITS;

  return (
    <>
      <PageHeader eyebrow="Administración" title="Configuración" subtitle={<p>Cuándo avisar y cada cuánto actualizar el panel.</p>} />

      <section className="panel" aria-labelledby="deteccion">
        <PanelHead id="deteccion" kicker="Alertas" title="Detección y actualización" />
        <form ref={formRef} className="form" noValidate onSubmit={onSubmit} onInput={onInput}>
          <TextField
            label="Minutos sin reporte antes de avisar"
            name="offlineWindowMinutes"
            type="number"
            inputMode="numeric"
            min={win.min}
            max={win.max}
            step={1}
            value={offline}
            onChange={(event) => setOffline(event.target.value)}
            error={errors.offlineWindowMinutes}
            hint={`Si un dispositivo no reporta durante más minutos que este valor, aparece como «Sin reporte reciente» y se crea una alerta de conexión. Entre ${win.min} y ${win.max}.`}
          />
          <TextField
            label="Segundos entre actualizaciones"
            name="pollIntervalSeconds"
            type="number"
            inputMode="numeric"
            min={pollLimits.min}
            max={pollLimits.max}
            step={1}
            value={poll}
            onChange={(event) => setPoll(event.target.value)}
            error={errors.pollIntervalSeconds}
            hint={`Cada cuántos segundos el panel pide datos nuevos al servidor mientras esta pestaña está visible. Con la pestaña oculta se detiene. Entre ${pollLimits.min} y ${pollLimits.max}, y como máximo la mitad de los minutos sin reporte.`}
          />
          {general ? (
            <p className="form-error" role="alert">
              {general}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={pending}>
              Guardar ajustes
            </button>
            <button type="button" className="text-button" onClick={() => void restore()}>
              Restablecer valores
            </button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="origen">
        <PanelHead id="origen" kicker="Datos" title="Origen de los datos" />
        <dl className="facts">
          <div className="fact">
            <dt>Lecturas y dispositivos</dt>
            <dd>{demo ? 'Modo demostración: datos simulados que no vienen del servidor.' : `Servidor de SoliCare en ${source.origin}.`}</dd>
          </div>
          <div className="fact">
            <dt>Personas, contactos y alertas</dt>
            <dd>
              Se guardan solo en este navegador: {care.people.length} {care.people.length === 1 ? 'persona' : 'personas'}, {contacts}{' '}
              {contacts === 1 ? 'contacto' : 'contactos'}, {alerts.length} {alerts.length === 1 ? 'alerta registrada' : 'alertas registradas'} y {notes}{' '}
              {notes === 1 ? 'nota' : 'notas'}. Otro navegador u otro equipo no los ve.
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="borrar">
        <PanelHead id="borrar" kicker="Este navegador" title="Datos locales" />
        <div className="danger-zone">
          <p>
            {demo
              ? 'Vuelve a los datos de ejemplo del modo demostración y quita los cambios que haya hecho: personas, contactos, notas, alertas atendidas y ajustes.'
              : 'Borra de este navegador las personas, los contactos, las notas, el estado de las alertas y los ajustes.'}{' '}
            No borra nada del servidor ni de otros navegadores.
          </p>
          <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
            Borrar datos locales
          </button>
        </div>
      </section>

      <ConfirmDialog open={confirming} title="¿Borrar los datos locales?" confirmLabel="Borrar datos locales" onConfirm={wipe} onCancel={() => setConfirming(false)}>
        <p>
          {demo ? 'Se restaurarán los datos de ejemplo.' : `Se borrarán ${care.people.length} ${care.people.length === 1 ? 'persona' : 'personas'}, ${contacts} ${contacts === 1 ? 'contacto' : 'contactos'} y todo el estado de las alertas.`}{' '}
          Solo afecta a este navegador. Esta acción no se puede deshacer.
        </p>
      </ConfirmDialog>
    </>
  );
}
