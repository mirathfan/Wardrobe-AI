export const DOCK_HEIGHT = 62;
export const DOCK_RADIUS = 26;
export const DOCK_SIDE_MARGIN = 16;
export const DOCK_BOTTOM_GAP = 0;
export const DOCK_ITEM_COUNT = 5;

export const dockSpace = (insetsBottom: number) =>
  DOCK_HEIGHT + DOCK_BOTTOM_GAP + insetsBottom;
