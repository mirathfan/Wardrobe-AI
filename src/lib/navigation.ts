import { router } from "expo-router";

type RouterHref = Parameters<typeof router.replace>[0];

export function safeGoBack(fallbackRoute: RouterHref) {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallbackRoute);
}
