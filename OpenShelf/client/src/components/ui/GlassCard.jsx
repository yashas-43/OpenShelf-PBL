export default function GlassCard({ children, className = "", as: Element = "div", ...props }) {
  return <Element className={`glass-card ${className}`} {...props}>{children}</Element>;
}
