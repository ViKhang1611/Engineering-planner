import type { ReactNode } from "react";
import { useTheme } from "../../theme/ThemeProvider";

export function CreativeHeroBanner({
  badgeCode,
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
  secondaryMeta,
}: {
  badgeCode: string;
  title: string;
  description: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryMeta?: ReactNode;
}) {
  const { appearance } = useTheme();
  if (!appearance.showHeroBanner) return null;

  return (
    <div className="creative-hero-banner">
      <div className="hero-hex-overlay" aria-hidden="true" />
      <div className="hero-content">
        <div className="hero-title-row">
          <span className="hero-app-tile">{badgeCode}</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
        <div className="hero-actions-row">
          <button
            type="button"
            className="hero-pill-cta"
            onClick={onPrimaryAction}
          >
            {primaryActionLabel}
          </button>
          {secondaryMeta && (
            <span className="hero-secondary-meta">{secondaryMeta}</span>
          )}
        </div>
      </div>
      <div className="hero-illustration" aria-hidden="true">
        <div className="hero-floating-card card-gantt">
          <i className="bar-1" />
          <i className="bar-2" />
          <i className="bar-3" />
        </div>
        <div className="hero-floating-card card-chart">
          <span className="mini-dot" />
          <span className="mini-line" />
        </div>
        <div className="hero-floating-card card-badge">WBS 2.1</div>
        <div className="hero-avatar-figure">
          <div className="figure-head">
            <span className="figure-visor" />
          </div>
          <div className="figure-body" />
          <span className="figure-orb orb-left" />
          <span className="figure-orb orb-right" />
        </div>
      </div>
    </div>
  );
}
