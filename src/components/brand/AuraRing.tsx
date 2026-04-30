import {
  Canvas,
  Circle,
  Group,
  Paint,
  SweepGradient,
  vec,
} from "@shopify/react-native-skia";
import { useEffect } from "react";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

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

export default function AuraRing({
  size,
  strokeWidth = 2,
  animated = true,
  duration = 3000,
  opacity = 1,
}: AuraRingProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!animated) {
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(
      withTiming(Math.PI * 2, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [animated, duration, rotation]);

  const transform = useDerivedValue(() => [{ rotate: rotation.value }]);

  const center = size / 2;
  const radius = center - strokeWidth;

  return (
    <Canvas style={{ width: size, height: size, opacity }}>
      <Group origin={vec(center, center)} transform={transform}>
        <Circle cx={center} cy={center} r={radius}>
          <Paint style="stroke" strokeWidth={strokeWidth} strokeCap="round">
            <SweepGradient c={vec(center, center)} colors={RING_COLORS} />
          </Paint>
        </Circle>
      </Group>
    </Canvas>
  );
}
