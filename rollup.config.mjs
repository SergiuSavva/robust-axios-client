import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { writeFileSync } from 'fs';

export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist/esm',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src'
    },
    external: ['axios'],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        sourceMap: true
      }),
      {
        name: 'create-esm-package',
        writeBundle() {
          const esmPackageJson = { 
            type: 'module',
            sideEffects: false
          };
          writeFileSync(
            'dist/esm/package.json',
            JSON.stringify(esmPackageJson, null, 2)
          );
          console.log('✅ Created dist/esm/package.json');
        }
      }
    ]
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist/cjs',
      format: 'cjs',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      exports: 'named'
    },
    external: ['axios'],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig-cjs.json',
        sourceMap: true
      })
    ]
  }
];