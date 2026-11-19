import { useCare, useCareActions } from '../data/hooks';
import type { Alert } from '../data/types';
import { useToast } from './Toast';

/**
 * Acknowledge or resolve one alert, with the confirmation toast and its "Deshacer" action. Shared by the
 * alert cards and the Resumen banner so both do exactly the same thing.
 */
export function useAlertActions(alert: Alert) {
  const actions = useCareActions();
  const { acknowledgements } = useCare();
  const toast = useToast();

  return async (kind: 'atender' | 'resolver', note?: string) => {
    const previous = acknowledgements[alert.id];
    if (kind === 'atender') await actions.acknowledgeAlert(alert.id, note);
    else await actions.resolveAlert(alert.id);
    toast({
      text: kind === 'atender' ? 'Alerta atendida' : 'Alerta resuelta',
      actionLabel: 'Deshacer',
      onAction: () => void actions.restoreAlertAck(alert.id, previous),
    });
  };
}
