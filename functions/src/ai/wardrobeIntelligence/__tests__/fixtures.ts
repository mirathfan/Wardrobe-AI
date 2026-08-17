import type { ClosetItemDocument } from "../types";

export const blackOversizedNikeHoodie: ClosetItemDocument = {
  id: "hoodie-1",
  name: "Black oversized Nike hoodie",
  brand: "Nike",
  category: "top",
  subCategory: "hoodie",
  colors: ["Black"],
  fit: "oversized",
  material: "cotton fleece",
  style: "streetwear",
  aestheticTags: ["casual", "minimal"],
  notes: "Works well with cargos, denim, and sneakers.",
  status: "AVAILABLE",
  wearCountSinceWash: 0,
  createdAt: 1,
};

export const whiteOxfordShirt: ClosetItemDocument = {
  id: "oxford-1",
  name: "White Oxford shirt",
  brand: "J.Crew",
  category: "top",
  subCategory: "shirt",
  colors: ["white"],
  fit: "regular",
  material: "cotton",
  style: "smart casual",
  occasionTags: ["office"],
  status: "AVAILABLE",
  wearCountSinceWash: 0,
  createdAt: 2,
};

export const blackLeatherLoafers: ClosetItemDocument = {
  id: "loafers-1",
  name: "Black leather loafers",
  brand: "G.H. Bass",
  category: "footwear",
  subCategory: "loafer",
  colors: ["black"],
  material: "leather",
  style: "classic",
  occasionTags: ["dinner"],
  status: "AVAILABLE",
  wearCountSinceWash: 0,
  createdAt: 3,
};
