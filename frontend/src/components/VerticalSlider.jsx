import React, { useCallback, useEffect, useRef } from "react";

const MARKS = [100, 75, 50, 25, 10, 5]; // top → bottom

// Vertical percentage slider with draggable knob + clickable track marks.
export function VerticalSlider({ value = 0, onChange, height }) {
  const railRef = useRef(null);
  const dragging = useRef(false);
  const warn = value > 75;
  const fill = warn ? "#f59e0b" : "#f7931a"; // orange warning vs gold
  const h = height || (typeof window !== "undefined" && window.innerWidth < 768 ? 190 : 230);

  const setFromClientY = useCallback((clientY) => {
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    let p = 1 - (clientY - rect.top) / rect.height; // bottom = 0, top = 1
    p = Math.max(0, Math.min(1, p));
    onChange && onChange(Math.round(p * 100));
  }, [onChange]);

  useEffect(() => {
    const move = (e) => { if (dragging.current) setFromClientY(e.touches ? e.touches[0].clientY : e.clientY); };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [setFromClientY]);

  const start = (e) => {
    dragging.current = true;
    setFromClientY(e.touches ? e.touches[0].clientY : e.clientY);
  };

  return (
    <div className="flex flex-col items-center select-none w-[40px] md:w-[54px]" data-testid="vertical-slider">
      <div className="relative" style={{ height: h }}>
        {/* Rail */}
        <div ref={railRef} onMouseDown={start} onTouchStart={start}
          className="absolute left-1/2 -translate-x-1/2 w-2.5 rounded-full bg-secondary cursor-pointer" style={{ height: h }}>
          {/* Filled portion (from bottom) */}
          <div className="absolute bottom-0 left-0 w-full rounded-full transition-[height] duration-75"
            style={{ height: `${value}%`, background: fill }} />
          {/* Track marks */}
          {MARKS.map((m) => (
            <button key={m} type="button" onClick={(e) => { e.stopPropagation(); onChange && onChange(m); }}
              data-testid={`slider-mark-${m}`}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center group"
              style={{ top: `${100 - m}%` }}>
              <span className="w-3.5 h-0.5 bg-border group-hover:bg-foreground" />
              <span className="ml-1 text-[0.5625rem] text-muted-foreground group-hover:text-foreground mono whitespace-nowrap">{m}%</span>
            </button>
          ))}
          {/* Knob */}
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ top: `${100 - value}%` }}>
            <div className="w-4 h-4 rounded-full border-2 shadow-lg" style={{ background: "#0b0d12", borderColor: fill }} />
            <div className={`absolute left-6 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[0.625rem] mono font-bold whitespace-nowrap ${warn ? "bg-amber-500/20 text-amber-400" : "bg-gold/15 text-gold"}`}
              data-testid="slider-percent">
              {value}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
