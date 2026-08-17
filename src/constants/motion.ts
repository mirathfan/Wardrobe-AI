import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

export const MotionDurations = {
  instant: 0,
  xs: 90,
  sm: 140,
  md: 220,
  lg: 320,
} as const;

export const MotionStagger = {
  section: 50,
  listItem: 28,
  maxSectionDelay: 240,
  maxListDelay: 196,
} as const;

export const MotionEasing = {
  standard: Easing.bezier(0.22, 1, 0.36, 1),
  emphasized: Easing.bezier(0.2, 0, 0, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
} as const;

export const MotionSpring = {
  press: {
    damping: 18,
    stiffness: 260,
    mass: 0.8,
    overshootClamping: true,
    reduceMotion: ReduceMotion.System,
  },
  card: {
    damping: 22,
    stiffness: 210,
    mass: 0.9,
    overshootClamping: true,
    reduceMotion: ReduceMotion.System,
  },
  sheet: {
    damping: 26,
    stiffness: 240,
    mass: 1,
    overshootClamping: true,
    reduceMotion: ReduceMotion.System,
  },
} as const;

function staggerDelay(index: number, step: number, maxDelay: number) {
  return Math.min(Math.max(0, index) * step, maxDelay);
}

export const MotionAnimations = {
  screenEnter: () =>
    FadeIn.duration(MotionDurations.md)
      .easing(MotionEasing.standard)
      .reduceMotion(ReduceMotion.System),
  sectionEnter: (index = 0) =>
    FadeInUp.duration(MotionDurations.md)
      .delay(staggerDelay(index, MotionStagger.section, MotionStagger.maxSectionDelay))
      .easing(MotionEasing.standard)
      .reduceMotion(ReduceMotion.System),
  listItemEnter: (index = 0) =>
    FadeInDown.duration(MotionDurations.sm)
      .delay(staggerDelay(index, MotionStagger.listItem, MotionStagger.maxListDelay))
      .easing(MotionEasing.standard)
      .reduceMotion(ReduceMotion.System),
  fadeOut: () =>
    FadeOut.duration(MotionDurations.sm)
      .easing(MotionEasing.exit)
      .reduceMotion(ReduceMotion.System),
  layout: () =>
    LinearTransition.duration(MotionDurations.md)
      .easing(MotionEasing.standard)
      .reduceMotion(ReduceMotion.System),
};
