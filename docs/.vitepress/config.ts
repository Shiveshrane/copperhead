import { defineConfig } from 'vitepress';

const REPO = 'https://github.com/chouhanindustries/copperhead';

export default defineConfig({
  title: 'copperhead',
  description: 'Cursor for circuit boards: an AI agent that designs, documents, and validates real PCBs on KiCad repositories',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  // Served at copperhead.animeshchouhan.ai/docs. The deploy workflow nests the
  // build output in a docs/ folder so the artifact layout matches this base.
  base: '/docs/',

  head: [['meta', { name: 'theme-color', content: '#b87333' }]],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/cli' },
      { text: 'Spec', link: `${REPO}/blob/main/openspec/specs/SPEC.md` },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'How it works', link: '/guide/how-it-works' },
            { text: 'Docs as memory', link: '/guide/docs-as-memory' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI', link: '/reference/cli' },
            { text: 'Configuration', link: '/reference/configuration' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: REPO }],

    editLink: {
      pattern: `${REPO}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },

    footer: {
      message: 'Apache-2.0. A Chouhan Industries project.',
      copyright: `© ${new Date().getFullYear()} Chouhan Industries`,
    },
  },
});
