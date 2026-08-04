import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useManagedSurface } from "./WindowManager";

interface SplitterProps {
  left: ReactNode;
  right: ReactNode;
  label: string;
}

const minPane = 320;

export function Splitter({ left, right, label }: SplitterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => {
    const stored = Number(localStorage.getItem("med.sourceSplitRatio"));
    return stored >= 0.25 && stored <= 0.75 ? stored : 0.5;
  });
  const [minimumRatio, setMinimumRatio] = useState(0.25);
  const surfaceId = useId();
  useManagedSurface({
    id: `splitter-${surfaceId}`,
    kind: "panel",
    ownerId: "main",
    closePolicy: "explicit",
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const constrain = () => {
      const width = container.getBoundingClientRect().width;
      if (!width) return;
      const minimum = Math.min(0.5, Math.max(0.25, minPane / width));
      setMinimumRatio(minimum);
      setRatio((current) => {
        const constrained = Math.max(minimum, Math.min(1 - minimum, current));
        if (constrained !== current) {
          localStorage.setItem("med.sourceSplitRatio", String(constrained));
        }
        return constrained;
      });
    };
    constrain();
    const observer = new ResizeObserver(constrain);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const updateRatio = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const next = Math.max(
      minimumRatio,
      Math.min(1 - minimumRatio, (clientX - bounds.left) / bounds.width),
    );
    setRatio(next);
    localStorage.setItem("med.sourceSplitRatio", String(next));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateRatio(event.clientX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const amount = event.shiftKey ? 32 : 10;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    updateRatio(bounds.left + bounds.width * ratio + direction * amount);
  };

  return (
    <div className="splitter" ref={containerRef}>
      <section className="splitter__pane" style={{ flexBasis: `${ratio * 100}%` }}>{left}</section>
      <div
        className="splitter__handle"
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={Math.round(minimumRatio * 100)}
        aria-valuemax={Math.round((1 - minimumRatio) * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateRatio(event.clientX);
        }}
        onKeyDown={handleKeyDown}
      />
      <section className="splitter__pane" style={{ flexBasis: `${(1 - ratio) * 100}%` }}>{right}</section>
    </div>
  );
}
