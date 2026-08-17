"use client";

import { Player } from "@remotion/player";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useReducedMotion } from "motion/react";

const slides = [
  {
    src: "assets/aura-chat-screen-public.webp",
    label: "Closet-based styling",
    note: "Looks built from pieces you own",
  },
  {
    src: "assets/closet-grid-screen-public.webp",
    label: "A closet that stays useful",
    note: "Clean items, searchable context",
  },
  {
    src: "assets/calendar-screen-public.webp",
    label: "Plan the week ahead",
    note: "Outfits meet dates and daily context",
  },
];

function ReelSlide({
  src,
  label,
  note,
  index,
}: (typeof slides)[number] & { index: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame: frame + 8,
    fps,
    config: { damping: 22, mass: 0.7, stiffness: 110 },
  });
  const opacity = interpolate(frame, [0, 62, 78], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(entrance, [0, 1], [50, 0]);
  const scale = interpolate(frame, [0, 78], [1.035, 1]);

  return (
    <AbsoluteFill style={{ opacity }}>
      <div className="reel-screen" style={{ transform: `translateY(${y}px) scale(${scale})` }}>
        <Img src={staticFile(src)} className="reel-screen-image" />
      </div>
      <div className="reel-caption" style={{ transform: `translateY(${y * 0.5}px)` }}>
        <span>0{index + 1}</span>
        <strong>{label}</strong>
        <p>{note}</p>
      </div>
    </AbsoluteFill>
  );
}

function AuraReelComposition() {
  return (
    <AbsoluteFill className="reel-canvas">
      <div className="reel-aura-mark">AURA</div>
      <div className="reel-orbit reel-orbit-one" />
      <div className="reel-orbit reel-orbit-two" />
      {slides.map((slide, index) => (
        <Sequence key={slide.src} from={index * 80} durationInFrames={80} premountFor={12}>
          <ReelSlide {...slide} index={index} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

export function AuraReel() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="reel-player" aria-label="Animated preview of the AURA app">
      <Player
        component={AuraReelComposition}
        durationInFrames={240}
        compositionWidth={800}
        compositionHeight={1000}
        fps={30}
        autoPlay={!reduceMotion}
        initialFrame={reduceMotion ? 30 : 0}
        loop
        controls={false}
        clickToPlay={false}
        acknowledgeRemotionLicense
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
