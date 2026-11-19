import { useEffect, useRef, useState, type FormEvent } from 'react';
import { StoreValidationError } from '../data/store';

/**
 * Submit handling for forms backed by the care store. The store's `StoreValidationError` carries the
 * Spanish message and the field it belongs to: the message is shown under that field and focus moves to
 * it once the error is in the DOM, so screen readers read it through aria-describedby. Anything else is
 * a general error. Errors clear per field as the person edits it.
 */
export function useForm(action: (data: FormData, form: HTMLFormElement) => Promise<void>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ name: string } | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    const control = formRef.current?.elements.namedItem(focusRequest.name);
    if (control instanceof HTMLElement) control.focus();
  }, [focusRequest]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setErrors({});
    setGeneral(null);
    setPending(true);
    try {
      await action(new FormData(form), form);
    } catch (error) {
      if (error instanceof StoreValidationError && form.elements.namedItem(error.field) instanceof HTMLElement) {
        setErrors({ [error.field]: error.message });
        setFocusRequest({ name: error.field });
      } else if (error instanceof StoreValidationError) {
        setGeneral(error.message);
      } else {
        setGeneral('No se pudo guardar. Intente de nuevo.');
      }
    } finally {
      setPending(false);
    }
  };

  const onInput = (event: FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement).name;
    if (name && errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  };

  return { formRef, errors, general, pending, onSubmit, onInput };
}

export const text = (data: FormData, name: string): string => String(data.get(name) ?? '');
