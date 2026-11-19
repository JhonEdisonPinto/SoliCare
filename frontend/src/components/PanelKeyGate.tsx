import { HeartPulse } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { TextField } from './Field';

/**
 * Shown before the panel when the server asks for the panel key. `verify` resolves to an error message in
 * Spanish when the key is refused, and does not resolve to anything useful on success (the parent then
 * replaces this screen with the panel).
 */
export function PanelKeyGate({ initialError, verify }: { initialError?: string; verify: (key: string) => Promise<string | null> }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const key = String(new FormData(event.currentTarget).get('panelKey') ?? '').trim();
    if (!key) {
      setError('Escriba la clave del panel.');
      return;
    }
    setError(null);
    setPending(true);
    setError(await verify(key));
    setPending(false);
  };

  return (
    <main className="gate" id="contenido">
      <div className="panel gate-card">
        <div className="gate-brand">
          <span className="brand-mark" aria-hidden="true">
            <HeartPulse size={21} strokeWidth={2.5} />
          </span>
          <span>SoliCare</span>
        </div>
        <h1 className="gate-title">
          Clave del panel
        </h1>
        <p className="gate-text">
          Los datos de las personas, sus contactos y las alertas atendidas se guardan en el servidor de SoliCare y solo los ve quien tiene la clave del panel. Pídasela a quien administra SoliCare. Este navegador la recordará.
        </p>
        <form className="form" noValidate onSubmit={onSubmit}>
          <TextField label="Clave del panel" name="panelKey" type="password" autoComplete="off" autoFocus error={error} />
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={pending}>
              {pending ? 'Comprobando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
