import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

/** Honest stand-in for a view that a later phase builds. Shows no data. */
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="notice">
        <h2 className="notice-title">En construcción</h2>
        <p>Esta vista todavía no está disponible. Mientras tanto, el estado de cada persona y sus alertas abiertas están en el resumen.</p>
        <p>
          <Link to="/">Volver al resumen</Link>
        </p>
      </div>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Página no encontrada" />
      <div className="notice">
        <p>La dirección que abrió no corresponde a ninguna vista del panel.</p>
        <p>
          <Link to="/">Ir al resumen</Link>
        </p>
      </div>
    </>
  );
}
