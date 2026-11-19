import { useEffect } from 'react';
import { useCareActions } from '../data/hooks';
import { useToast } from './Toast';

/** Shows a toast whenever the server storage could not save a change (no connection, a conflict that did not clear, a refused document). */
export function CareErrorToaster() {
  const repository = useCareActions();
  const toast = useToast();
  useEffect(() => repository.subscribeErrors?.((text) => toast({ text })), [repository, toast]);
  return null;
}
