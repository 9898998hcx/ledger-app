const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', 'public/*', 'coverage/*'],
    settings: {
      // 使用 node resolver，避免插件内置 typescript resolver 在 Node 24 下的接口兼容问题
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      },
    },
    rules: {
      'import/namespace': 'off',
      // 页面挂载时异步加载数据，属于常见数据加载模式
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
