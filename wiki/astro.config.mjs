import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';

const isGithubActions = !!process.env.GITHUB_ACTIONS;

export default defineConfig({
  output: 'static',
  integrations: [UnoCSS()],
  site: isGithubActions ? 'https://clouds56-bot.github.io' : undefined,
  base: isGithubActions ? '/blood-clocktower-wiki' : undefined,
});
