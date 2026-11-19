import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

/** Honest stand-in for a view that a later phase builds. Shows no data. */
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="block" aria-labelledby="en-construccion">
        <div className="block-head">
          <h2 id="en-construccion" className="block-title">
            En construcción
          </h2>
        </div>
        <p className="empty-row">
          Esta vista todavía no está disponible. Mientras tanto, el estado de cada persona y sus alertas abiertas están en el resumen.{' '}
          <Link to="/">Volver al resumen</Link>
        </p>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Página no encontrada" />
      <p className="empty-row">
        La dirección que abrió no corresponde a ninguna vista del panel. <Link to="/">Ir al resumen</Link>
      </p>
    </>
  );
}
