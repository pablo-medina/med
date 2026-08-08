interface AppLogoProps {
  className?: string;
  title?: string;
}

export function AppLogo({ className = "", title }: AppLogoProps) {
  return (
    <svg
      className={`app-logo ${className}`.trim()}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect className="app-logo__tile" x="2" y="2" width="44" height="44" rx="10" />
      <path className="app-logo__paper" d="M14 8.5h14l7 7v24H14z" />
      <path className="app-logo__fold" d="M28 8.5v7h7z" />
      <path
        className="app-logo__hash"
        d="M22.4 20.5 21.2 33m6.6-12.5L26.6 33M18.8 24.5h12m-12.8 5h12"
      />
    </svg>
  );
}
