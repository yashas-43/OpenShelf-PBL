import { CheckCircle2, AlertCircle, Clock3 } from "lucide-react";
const config = {
  success: { icon: CheckCircle2, label: "Success" },
  warning: { icon: Clock3, label: "Pending" },
  danger: { icon: AlertCircle, label: "Attention" },
  neutral: { icon: Clock3, label: "Neutral" },
};
export default function StatusPill({ status = "neutral", children }) {
  const item = config[status] || config.neutral;
  const Icon = item.icon;
  return <span className={`status-pill status-${status}`}><Icon size={13} />{children || item.label}</span>;
}
