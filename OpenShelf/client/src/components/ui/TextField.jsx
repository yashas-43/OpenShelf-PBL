import { forwardRef } from "react";
const TextField = forwardRef(function TextField({ label, hint, error, id, className = "", ...props }, ref) {
  const fieldId = id || props.name;
  return (
    <label className={`field-wrap ${className}`} htmlFor={fieldId}>
      {label && <span className="field-label">{label}</span>}
      <input ref={ref} id={fieldId} className={`text-field ${error ? "text-field-error" : ""}`} aria-invalid={!!error} {...props} />
      {(error || hint) && <span className={`field-hint ${error ? "field-error" : ""}`}>{error || hint}</span>}
    </label>
  );
});
export default TextField;
