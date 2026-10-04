import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cloneElement } from 'react';

interface Props {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  children: ReactElement<Record<string, unknown>>;
}

/** Wires label, hint and error to the control with ids, so screen readers announce all three. */
export function Field({ label, error, hint, required, children }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {required && <span className="field__req"> (required)</span>}
      </label>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
