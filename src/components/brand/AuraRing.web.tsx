import { useEffect } from "react";
import type { CSSProperties } from "react";

export const RING_SIZE_SM = 40;
export const RING_SIZE_MD = 80;
export const RING_SIZE_LG = 160;
export const RING_SIZE_XL = 240;

type AuraRingProps = {
  size: number;
  strokeWidth?: number;
  animated?: boolean;
  duration?: number;
  opacity?: number;
};

const RING_COLORS = ["#F4A460", "#C084FC", "#818CF8", "#C084FC", "#F4A460"];
const KEYFRAMES_ID = "aura-ring-keyframes";

function ensureKeyframes() {
  if (typeof document === "undefined" || document.getElementById(KEYFRAMES_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes aura-ring-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

export default function AuraRing({
  size,
  strokeWidth = 2,
  animated = true,
  duration = 3000,
  opacity = 1,
}: AuraRingProps) {
  useEffect(() => {
    if (animated) {
      ensureKeyframes();
    }
  }, [animated]);

  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${strokeWidth}px), #000 calc(100% - ${strokeWidth}px))`;
  const style: CSSProperties = {
    animation: animated ? `aura-ring-spin ${duration}ms linear infinite` : undefined,
    background: `conic-gradient(${RING_COLORS.join(", ")})`,
    borderRadius: "50%",
    height: size,
    mask: ringMask,
    opacity,
    WebkitMask: ringMask,
    width: size,
  };

  return <div aria-hidden style={style} />;
}
