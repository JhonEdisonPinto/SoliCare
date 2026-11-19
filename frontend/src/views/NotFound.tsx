import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function NotFound() {
  return (
    <>
      <PageHeader title="Página no encontrada" />
      <p className="panel panel-empty">
        La dirección que abriste no corresponde a ninguna vista del panel. <Link to="/">Ir al resumen</Link>
      </p>
    </>
  );
}
