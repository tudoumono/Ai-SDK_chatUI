import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={48} strokeWidth={1.5} color="var(--accent)" />
      </div>
      <div>
        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-description">{description}</p>
      </div>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
