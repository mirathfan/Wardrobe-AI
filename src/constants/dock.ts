export const FLOATING_TAB_BAR_HEIGHT = 58;
export const DOCK_HEIGHT = FLOATING_TAB_BAR_HEIGHT;
export const DOCK_RADIUS = 24;
export const DOCK_SIDE_MARGIN = 16;
export const FLOATING_TAB_BAR_BOTTOM_INSET_MIN = 14;
export const DOCK_BOTTOM_GAP = FLOATING_TAB_BAR_BOTTOM_INSET_MIN;
export const DOCK_ITEM_COUNT = 5;
export const FLOATING_CONTROL_GAP = 14;
export const SCREEN_BOTTOM_EXTRA_PADDING = 48;

export const floatingTabBarBottomInset = (insetsBottom: number) =>
  Math.max(FLOATING_TAB_BAR_BOTTOM_INSET_MIN, insetsBottom * 0.35);

export const floatingTabBarTopOffset = (insetsBottom: number) =>
  floatingTabBarBottomInset(insetsBottom) + FLOATING_TAB_BAR_HEIGHT;

export const tabBarContentClearance = (insetsBottom: number) =>
  FLOATING_TAB_BAR_HEIGHT + insetsBottom + SCREEN_BOTTOM_EXTRA_PADDING;

export const screenBottomContentPadding = (insetsBottom: number) =>
  Math.max(floatingTabBarTopOffset(insetsBottom) + SCREEN_BOTTOM_EXTRA_PADDING, tabBarContentClearance(insetsBottom));

export const composerBottomOffset = (insetsBottom: number) =>
  floatingTabBarTopOffset(insetsBottom) + FLOATING_CONTROL_GAP;

export const dockSpace = screenBottomContentPadding;
