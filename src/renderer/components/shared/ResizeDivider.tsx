import React, { useRef, useCallback, useEffect } from "react";

interface ResizeDividerProps {
  /** "horizontal" = row-resize (drag up/down), "vertical" = col-resize (drag left/right) */
  orientation: "horizontal" | "vertical";
  /** Called with the pixel delta along the drag axis */
  onDrag: (delta: number) => void;
}

/**
 * Thin draggable divider for resizable panel splits.
 * 4px thick, transparent background, peach accent on hover.
 *
 * Uses a ref to always call the latest onDrag, avoiding stale closure issues
 * during continuous mouse-move events.
 */
const ResizeDivider: React.FC<ResizeDividerProps> = ({ orientation, onDrag }) => {
  const dragging = useRef(false);
  const lastPos = useRef(0);
  const onDragRef = useRef(onDrag);

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    onDragRef.current = onDrag;
  }, [onDrag]);

  const isHorizontal = orientation === "horizontal";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastPos.current = isHorizontal ? e.clientY : e.clientX;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        ev.preventDefault();
        const current = isHorizontal ? ev.clientY : ev.clientX;
        const delta = current - lastPos.current;
        if (delta !== 0) {
          onDragRef.current(delta);
          lastPos.current = current;
        }
      };

      const handleMouseUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [isHorizontal],
  );

  return (
    <div
      role="separator"
      aria-label="Resize panel"
      aria-orientation={isHorizontal ? "horizontal" : "vertical"}
      onMouseDown={handleMouseDown}
      className={[
        "shrink-0 transition-colors",
        isHorizontal
          ? "w-full border-t border-stone-800 hover:border-[#e8a872]/40"
          : "h-full border-l border-stone-800 hover:border-[#e8a872]/40",
      ].join(" ")}
      style={{
        ...(isHorizontal ? { height: 4 } : { width: 4 }),
        cursor: isHorizontal ? "row-resize" : "col-resize",
        backgroundColor: "transparent",
      }}
    />
  );
};

export default ResizeDivider;
