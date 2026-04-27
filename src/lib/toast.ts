import * as Burnt from "burnt";

export const Toast = {
  success: (title: string, message?: string) => {
    Burnt.toast({
      title,
      message,
      preset: "done",
      duration: 2,
    });
  },

  error: (title: string, message?: string) => {
    Burnt.toast({
      title,
      message,
      preset: "error",
      duration: 3,
    });
  },

  saved: () => {
    Burnt.toast({
      title: "Look saved",
      message: "AURA will remember this style",
      preset: "done",
      duration: 2,
    });
  },

  itemAdded: () => {
    Burnt.toast({
      title: "Added to wardrobe",
      preset: "done",
      duration: 1.5,
    });
  },

  worn: () => {
    Burnt.toast({
      title: "Outfit logged",
      message: "AURA is learning your style",
      preset: "done",
      duration: 2,
    });
  },
};
