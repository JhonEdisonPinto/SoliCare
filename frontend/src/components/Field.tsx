import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type FieldBase = {
  label: string;
  /** Validation message for this field, shown under it and linked with aria-describedby. */
  error?: string | null;
  /** Persistent help text, shown between the label and the control. */
  hint?: ReactNode;
};

type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true };

function Field({ label, error, hint, children }: FieldBase & { children: (control: ControlProps) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p className="field-error" id={errorId}>
          <span className="visually-hidden">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  inputRef,
  ...input
}: FieldBase & InputHTMLAttributes<HTMLInputElement> & { name: string; inputRef?: Ref<HTMLInputElement> }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(control) => <input className="control" ref={inputRef} {...input} {...control} />}
    </Field>
  );
}

export function SelectField({ label, error, hint, children, ...select }: FieldBase & SelectHTMLAttributes<HTMLSelectElement> & { name: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(control) => (
        <select className="control" {...select} {...control}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({ label, error, hint, ...area }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(control) => <textarea className="control" {...area} {...control} />}
    </Field>
  );
}
