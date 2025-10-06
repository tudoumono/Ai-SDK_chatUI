import { CheckCircle2, XCircle, AlertCircle, Loader2, Clock } from "lucide-react";

type StatusType = "success" | "error" | "warning" | "loading" | "idle";

interface StatusBadgeProps {
  status: StatusType;
  text: string;
}

export function StatusBadge({ status, text }: StatusBadgeProps) {
  const config = {
    success: {
      icon: CheckCircle2,
      className: "status-badge-success",
      color: "#10b981",
    },
    error: {
      icon: XCircle,
      className: "status-badge-error",
      color: "#ef4444",
    },
    warning: {
      icon: AlertCircle,
      className: "status-badge-warning",
      color: "#f59e0b",
    },
    loading: {
      icon: Loader2,
      className: "status-badge-loading",
      color: "#3b82f6",
    },
    idle: {
      icon: Clock,
      className: "status-badge-idle",
      color: "#6b7280",
    },
  };

  const { icon: Icon, className, color } = config[status];
  const isLoading = status === "loading";

  return (
    <div className={`status-badge ${className}`}>
      <Icon
        size={16}
        strokeWidth={2}
        color={color}
        className={isLoading ? "status-icon-spin" : ""}
      />
      <span className="status-badge-text">{text}</span>
    </div>
  );
}
