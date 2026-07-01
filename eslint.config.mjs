import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".open-next/**", ".tmp/**", "coverage/**"]
  }
];

export default eslintConfig;
