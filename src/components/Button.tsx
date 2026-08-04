import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  variant?: "neutral" | "primary" | "danger";
  children: ReactNode;
}

export function Button({ icon, variant = "neutral", children, className = "", ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  selected?: boolean;
}

export function IconButton({ icon, label, selected, className = "", ...props }: IconButtonProps) {
  return (
    <button
      className={`icon-button ${selected ? "is-selected" : ""} ${className}`}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}
