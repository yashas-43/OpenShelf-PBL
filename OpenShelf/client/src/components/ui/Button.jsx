import { forwardRef } from "react";
import { LoaderCircle } from "lucide-react";

const variants = {
  primary: "ui-button-primary",
  secondary: "ui-button-secondary",
  ghost: "ui-button-ghost",
  outline: "ui-button-outline",
};

const Button = forwardRef(function Button({
  children, variant = "primary", size = "md", loading = false,
  className = "", disabled, type = "button", ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`ui-button ${variants[variant] || variants.primary} ui-button-${size} ${className}`}
      {...props}
    >
      {loading && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
});

export default Button;
