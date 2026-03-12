module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["/lib/**/*", "/generated/**/*"],
  rules: {
    // keep lint lightweight so deploy never blocks you
    quotes: ["error", "double"],
    "import/no-unresolved": "off",
    "require-jsdoc": "off",
    "max-len": "off",
    "operator-linebreak": "off",
    "object-curly-spacing": "off",
    "quote-props": "off",
    indent: "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
};
