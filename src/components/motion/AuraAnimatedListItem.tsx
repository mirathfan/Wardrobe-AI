import React, { useMemo } from "react";
import { type ViewProps } from "react-native";
import Animated from "react-native-reanimated";

import { MotionAnimations } from "@/src/constants/motion";

export type AuraAnimatedListItemProps = ViewProps & {
  children?: React.ReactNode;
  index?: number;
};

function AuraAnimatedListItem({
  children,
  index = 0,
  ...props
}: AuraAnimatedListItemProps) {
  const entering = useMemo(() => MotionAnimations.listItemEnter(index), [index]);
  const exiting = useMemo(() => MotionAnimations.fadeOut(), []);
  const layout = useMemo(() => MotionAnimations.layout(), []);

  return (
    <Animated.View {...props} entering={entering} exiting={exiting} layout={layout}>
      {children}
    </Animated.View>
  );
}

export default React.memo(AuraAnimatedListItem);
