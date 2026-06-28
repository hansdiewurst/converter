import * as esbuild from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";

await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/bundle.js",
    minify: true,
    plugins: [
        nodeModulesPolyfillPlugin({
            globals: {
                Buffer: true,
            },
        })
    ]
});