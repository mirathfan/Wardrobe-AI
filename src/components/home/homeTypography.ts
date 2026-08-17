import { Platform, StyleSheet } from "react-native";

const systemFontFamily = Platform.select({
  ios: undefined,
  android: "sans-serif",
  web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
});

const systemFont = systemFontFamily ? { fontFamily: systemFontFamily } : {};

export const homeTypography = StyleSheet.create({
  titleLarge: {
    ...systemFont,
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "700",
    letterSpacing: -0.45,
  },
  titleMedium: {
    ...systemFont,
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  titleSmall: {
    ...systemFont,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.15,
  },
  body: {
    ...systemFont,
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: 0,
  },
  bodySmall: {
    ...systemFont,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: 0,
  },
  caption: {
    ...systemFont,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    letterSpacing: 0,
  },
  label: {
    ...systemFont,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: 1.2,
  },
  accentNote: {
    ...systemFont,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: 0,
  },
  slotTitle: {
    ...systemFont,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0,
  },
  chipText: {
    ...systemFont,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: 0,
  },
  buttonText: {
    ...systemFont,
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
