import React, { useMemo } from "react";
import { type ViewProps } from "react-native";
import Animated from "react-native-reanimated";

import { MotionAnimations } from "@/src/constants/motion";

export type AuraAnimatedSectionProps = ViewProps & {
  children?: React.ReactNode;
  index?: number;
  withLayout?: boolean;
};

function AuraAnimatedSection({
  children,
  index = 0,
  withLayout = false,
  ...props
}: AuraAnimatedSectionProps) {
  const entering = useMemo(() => MotionAnimations.sectionEnter(index), [index]);
  const exiting = useMemo(() => MotionAnimations.fadeOut(), []);
  const layout = useMemo(
    () => (withLayout ? MotionAnimations.layout() : undefined),
    [withLayout],
  );

  return (
    <Animated.View {...props} entering={entering} exiting={exiting} layout={layout}>
      {children}
    </Animated.View>
  );
}

export default React.memo(AuraAnimatedSection);
