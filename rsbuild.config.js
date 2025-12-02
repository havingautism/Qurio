import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig(({ env }) => {
  const envVars = loadEnv({
    mode: env.envMode,
    prefixes: ['PUBLIC_'],
  });

  const openAIBaseUrl =
    envVars.parsed.PUBLIC_OPENAI_BASE_URL ||
    process.env.PUBLIC_OPENAI_BASE_URL 

  return {
    plugins: [pluginReact()],
    html: {
      template: './index.html',
    },
    source: {
      entry: {
        index: './src/main.jsx',
      },
      define: {
        ...envVars.publicVars,
      },
    },
    server: {
      host: '0.0.0.0',
      proxy: openAIBaseUrl
        ? {
            '/api/openaiCompatible': {
              target: openAIBaseUrl,
              changeOrigin: true,
              pathRewrite: { '^/api/openaiCompatible': '' },
            },
          }
        : undefined,
    },
  };
});
