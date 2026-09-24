import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";

type Validators<T> = Partial<{
  [K in keyof T]: (value: T[K], values: T) => string | undefined;
}>;

type UseFormOptions<T> = {
  initialValues: T;
  validators?: Validators<T>;
  onSubmit: (values: T) => Promise<void>;
};

type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function useForm<T extends Record<string, string>>({
  initialValues,
  validators,
  onSubmit,
}: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FieldErrors<T>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateField(name: keyof T, value: T[keyof T]): string | undefined {
    return validators?.[name]?.(value, values);
  }

  function handleChange(name: keyof T, value: T[keyof T]): void {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleBlur(name: keyof T): void {
    setErrors((prev) => ({ ...prev, [name]: validateField(name, values[name]) }));
  }

  function validateAll(): boolean {
    if (!validators) return true;
    const nextErrors: FieldErrors<T> = {};
    let hasError = false;
    for (const key of Object.keys(validators) as (keyof T)[]) {
      const error = validateField(key, values[key]);
      if (error) {
        nextErrors[key] = error;
        hasError = true;
      }
    }
    setErrors(nextErrors);
    return !hasError;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    if (!validateAll()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) {
          const nextErrors: FieldErrors<T> = {};
          for (const [field, messages] of Object.entries(err.fieldErrors)) {
            if (messages?.[0]) {
              nextErrors[field as keyof T] = messages[0];
            }
          }
          setErrors((prev) => ({ ...prev, ...nextErrors }));
        }
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit };
}
