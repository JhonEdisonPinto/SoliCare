import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

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
