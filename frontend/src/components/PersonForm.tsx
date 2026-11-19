import type { Person } from '../data/types';
import { useCare, useCareActions, useTelemetry } from '../data/hooks';
import { assignableDevices } from '../data/summary';
import { text, useForm } from '../lib/useForm';
import { SelectField, TextField } from './Field';
import { useToast } from './Toast';

/** Add or edit a person. Validation messages come from the store and appear under the right field. */
export function PersonForm({ person, onDone, onCancel }: { person?: Person; onDone: (saved: Person) => void; onCancel: () => void }) {
  const actions = useCareActions();
  const { people } = useCare();
  const { devices } = useTelemetry();
  const toast = useToast();
  const options = assignableDevices(people, devices, person?.id);

  const { formRef, errors, general, pending, onSubmit, onInput } = useForm(async (data) => {
    const input = { name: text(data, 'name'), relation: text(data, 'relation'), deviceId: text(data, 'deviceId') || null };
    const saved = person ? await actions.updatePerson(person.id, input) : await actions.addPerson(input);
    toast({ text: 'Persona guardada' });
    onDone(saved);
  });

  return (
    <form ref={formRef} className="form" noValidate onSubmit={onSubmit} onInput={onInput}>
      <TextField label="Nombre" name="name" defaultValue={person?.name} error={errors.name} autoComplete="off" autoFocus />
      <TextField
        label="Relación (opcional)"
        name="relation"
        defaultValue={person?.relation}
        error={errors.relation}
        hint="Cómo se relaciona con usted, por ejemplo Mamá o Abuelo."
        autoComplete="off"
      />
      <SelectField
        label="Dispositivo (opcional)"
        name="deviceId"
        defaultValue={person?.deviceId ?? ''}
        error={errors.deviceId}
        hint={
          options.length === 0
            ? 'Todavía no hay dispositivos libres que el servidor haya visto. Puede asignarlo después.'
            : 'Dispositivos que el servidor ya conoce y que nadie más tiene asignados.'
        }
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
        <button type="submit" className="key" disabled={pending}>
          Guardar persona
        </button>
        <button type="button" className="link-action" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
