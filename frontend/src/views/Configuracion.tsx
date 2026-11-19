import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TextField } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { PanelHead } from '../components/PanelHead';
import { useToast } from '../components/Toast';
import { changePanelKey } from '../data/careBackend';
import { useAlerts, useCare, useCareActions, useTelemetry } from '../data/hooks';
import { mergeCareData, type MergeReport } from '../data/merge';
import { clearPanelKey, getPanelKey } from '../data/panelKey';
import type { ServerCareRepository } from '../data/serverStore';
import { readLocalCareData, SETTINGS_LIMITS, StoreValidationError } from '../data/store';
import { DEFAULT_SETTINGS } from '../data/types';
import { text, useForm } from '../lib/useForm';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The lines of the confirmation that says what uploading this browser's data will do. */
function MergeSummary({ report }: { report: MergeReport }) {
  const parts = [
    report.peopleAdded > 0 ? plural(report.peopleAdded, 'persona', 'personas') : null,
    report.contactsAdded > 0 ? plural(report.contactsAdded, 'contacto', 'contactos') : null,
    report.acknowledgementsAdded > 0 ? plural(report.acknowledgementsAdded, 'alerta atendida', 'alertas atendidas') : null,
    report.journalAdded > 0 ? plural(report.journalAdded, 'evento del registro de alertas', 'eventos del registro de alertas') : null,
  ].filter(Boolean);
  return (
    <>
      <p>Se subirán al servidor: {parts.length > 0 ? parts.join(', ') : 'solo los ajustes'}. Lo que ya está en el servidor no se modifica.</p>
      {report.skippedDevices.length > 0 ? (
        <>
          <p>Estos dispositivos ya están asignados en el servidor y se quedan con su persona:</p>
          <ul>
            {report.skippedDevices.map((skipped) => (
              <li key={skipped.deviceId}>
                {skipped.deviceId} sigue con {skipped.owner}; {skipped.person} se sube sin dispositivo.
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {report.settingsFromLocal ? <p>El servidor aún no tenía ajustes: se usarán los de este navegador.</p> : null}
      <p>La copia de este navegador no se borra.</p>
    </>
  );
}

export function Configuracion() {
  const actions = useCareActions();
  const toast = useToast();
  const care = useCare();
  const { alerts } = useAlerts();
  const { source } = useTelemetry();
  const [offline, setOffline] = useState(String(care.settings.offlineWindowMinutes));
  const [poll, setPoll] = useState(String(care.settings.pollIntervalSeconds));
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const demo = source.kind === 'demo';
  const server = actions.storage === 'server';
  const hasKey = getPanelKey() !== null;
  // What this browser still holds from before the server stored the data, and what uploading it would do.
  const local = useMemo(() => (server ? readLocalCareData() : null), [server]);
  const preview = useMemo(
    () => (server && local && local.people.length > 0 ? mergeCareData(care, (actions as ServerCareRepository).getVersion(), local) : null),
    [server, local, care, actions],
  );

  const { formRef, errors, general, pending, onSubmit, onInput } = useForm(async (data) => {
    await actions.updateSettings({
      offlineWindowMinutes: Number(text(data, 'offlineWindowMinutes')),
      pollIntervalSeconds: Number(text(data, 'pollIntervalSeconds')),
    });
    toast({ text: 'Ajustes guardados' });
  });

  const keyForm = useForm(async (data) => {
    const result = await changePanelKey(text(data, 'panelKey').trim());
    if (!result.ok) throw new StoreValidationError('panelKey', result.error);
    setChangingKey(false);
    toast({ text: 'Clave del panel actualizada' });
    void actions.refresh?.();
  });

  const forgetKey = () => {
    clearPanelKey();
    window.location.reload();
  };

  const upload = async () => {
    if (!local) return;
    try {
      const report = await (actions as ServerCareRepository).importLocal(local);
      toast({ text: report.changed ? 'Datos de este navegador subidos al servidor' : 'El servidor ya tenía estos datos' });
    } catch {
      // The failure was already announced by the storage error toast.
    } finally {
      setUploading(false);
    }
  };

  const restore = async () => {
    await actions.updateSettings(DEFAULT_SETTINGS);
    setOffline(String(DEFAULT_SETTINGS.offlineWindowMinutes));
    setPoll(String(DEFAULT_SETTINGS.pollIntervalSeconds));
    toast({ text: 'Valores restablecidos' });
  };

  const wipe = async () => {
    try {
      await actions.reset();
    } catch {
      setConfirming(false);
      return;
    }
    setConfirming(false);
    setOffline(String(DEFAULT_SETTINGS.offlineWindowMinutes));
    setPoll(String(DEFAULT_SETTINGS.pollIntervalSeconds));
    toast({ text: server ? 'Datos del servidor borrados' : 'Datos locales borrados' });
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
              {server ? 'Se guardan en el servidor de SoliCare y los ven todos los paneles con la clave' : 'Se guardan solo en este navegador'}: {care.people.length} {care.people.length === 1 ? 'persona' : 'personas'}, {contacts}{' '}
              {contacts === 1 ? 'contacto' : 'contactos'}, {alerts.length} {alerts.length === 1 ? 'alerta registrada' : 'alertas registradas'} y {notes}{' '}
              {notes === 1 ? 'nota' : 'notas'}.{server ? '' : ' Otro navegador u otro equipo no los ve.'}
            </dd>
          </div>
        </dl>
      </section>

      {server ? (
        <section className="panel" aria-labelledby="acceso">
          <PanelHead id="acceso" kicker="Seguridad" title="Clave del panel" />
          <p className="settings-text">
            {hasKey
              ? 'Este navegador recuerda la clave del panel y la envía al servidor en cada petición. Cualquiera que la tenga puede ver y editar estos datos.'
              : 'Este servidor no pidió una clave del panel.'}
          </p>
          {hasKey ? (
            changingKey ? (
              <form ref={keyForm.formRef} className="form" noValidate onSubmit={keyForm.onSubmit} onInput={keyForm.onInput}>
                <TextField label="Nueva clave del panel" name="panelKey" type="password" autoComplete="off" autoFocus error={keyForm.errors.panelKey} />
                {keyForm.general ? (
                  <p className="form-error" role="alert">
                    {keyForm.general}
                  </p>
                ) : null}
                <div className="form-actions">
                  <button type="submit" className="btn btn--primary" disabled={keyForm.pending}>
                    Guardar clave
                  </button>
                  <button type="button" className="text-button" onClick={() => setChangingKey(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="form-actions">
                <button type="button" className="btn btn--outline" onClick={() => setChangingKey(true)}>
                  Cambiar clave del panel
                </button>
                <button type="button" className="text-button" onClick={() => setForgetting(true)}>
                  Olvidar clave
                </button>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      {server && local && local.people.length > 0 ? (
        <section className="panel" aria-labelledby="subir">
          <PanelHead id="subir" kicker="Este navegador" title="Datos guardados antes en este navegador" />
          <p className="settings-text">
            {preview?.report.changed
              ? `Este navegador todavía guarda ${plural(local.people.length, 'persona', 'personas')} que el servidor no tiene. Súbalos para que todos los paneles los vean.`
              : 'Los datos que este navegador guardaba antes ya están en el servidor. La copia local sigue aquí y no se usa.'}
          </p>
          {preview?.report.changed ? (
            <div className="form-actions">
              <button type="button" className="btn btn--primary" onClick={() => setUploading(true)}>
                Subir los datos de este navegador al servidor
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="borrar">
        <PanelHead id="borrar" kicker={server ? 'Servidor' : 'Este navegador'} title={server ? 'Datos del servidor' : 'Datos locales'} />
        <div className="danger-zone">
          <p>
            {demo
              ? 'Vuelve a los datos de ejemplo del modo demostración y quita los cambios que haya hecho: personas, contactos, notas, alertas atendidas y ajustes.'
              : server
                ? 'Borra del servidor las personas, los contactos, las notas, el estado de las alertas y los ajustes. Todos los paneles dejarán de verlos.'
                : 'Borra de este navegador las personas, los contactos, las notas, el estado de las alertas y los ajustes.'}{' '}
            {server ? 'No borra la copia que este navegador guardaba antes.' : 'No borra nada del servidor ni de otros navegadores.'}
          </p>
          <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
            {server ? 'Borrar datos del servidor' : 'Borrar datos locales'}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirming}
        title={server ? '¿Borrar los datos del servidor?' : '¿Borrar los datos locales?'}
        confirmLabel={server ? 'Borrar datos del servidor' : 'Borrar datos locales'}
        onConfirm={wipe}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {demo ? 'Se restaurarán los datos de ejemplo.' : `Se borrarán ${care.people.length} ${care.people.length === 1 ? 'persona' : 'personas'}, ${contacts} ${contacts === 1 ? 'contacto' : 'contactos'} y todo el estado de las alertas.`}{' '}
          {server ? 'Afecta a todos los paneles que usan el servidor.' : 'Solo afecta a este navegador.'} Esta acción no se puede deshacer.
        </p>
      </ConfirmDialog>

      <ConfirmDialog open={forgetting} title="¿Olvidar la clave del panel?" confirmLabel="Olvidar clave" onConfirm={forgetKey} onCancel={() => setForgetting(false)}>
        <p>Este navegador dejará de mostrar los datos hasta que escriba la clave otra vez. No se borra nada del servidor.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={uploading}
        title="¿Subir los datos de este navegador?"
        confirmLabel="Subir datos"
        tone="primary"
        onConfirm={upload}
        onCancel={() => setUploading(false)}
      >
        {preview ? <MergeSummary report={preview.report} /> : null}
      </ConfirmDialog>
    </>
  );
}
