import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        env: {
            node: true,
            es2021: true,
            commonjs: true,
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
        },
    },
];
