import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import preserveShebang from 'rollup-plugin-preserve-shebang';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: false,
    preserveModules: true, // 保留模块结构，方便调试
    preserveModulesRoot: 'src',
  },
  external: [
    // Node.js 内置模块
    'child_process',
    'util',
    'path',
    'fs',
    'os',
    'crypto',
    'stream',
    'events',
    'url',
    
    // 外部依赖（不打包进去）
    'commander',
    'ts-morph',
    'globby',
    'chalk',
    'fs-extra',
  ],
  plugins: [
    preserveShebang(), // 保留 shebang
    resolve({
      preferBuiltins: true, // 优先使用 Node.js 内置模块
    }),
    commonjs(), // 转换 CommonJS 模块
    json(), // 支持导入 JSON
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      rootDir: 'src',
    }),
  ],
};

