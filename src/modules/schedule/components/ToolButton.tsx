import type { ReactNode } from "react";

export function ToolButton({
  children,
  icon,
  onClick,
  disabled,
  active,
  title,
}: {
  children?: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`tool ${active ? "tool-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}
