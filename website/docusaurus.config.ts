import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

/** Injected at docs-build time from GitHub Actions var UMAMI_WEBSITE_ID. */
const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID?.trim();

const config: Config = {
  title: "know-code",
  tagline: "Agents don’t push until you know exactly what’s changed",
  favicon: "img/logo.svg",

  future: {
    v4: true,
  },

  url: "https://kc.chtnnhfoundation.org",
  baseUrl: "/",

  organizationName: "chtnnh",
  projectName: "know-code",

  onBrokenLinks: "throw",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    mermaid: true,
  },

  themes: ["@docusaurus/theme-mermaid"],

  // Same-origin Umami via Cloudflare Worker (/s/x.js → self-hosted origin).
  // Omitted when UMAMI_WEBSITE_ID is unset (local preview, unconfigured CI).
  headTags: umamiWebsiteId
    ? [
        {
          tagName: "script",
          attributes: {
            defer: "defer",
            src: "/s/x.js",
            "data-website-id": umamiWebsiteId,
            "data-domains": "kc.chtnnhfoundation.org",
            "data-do-not-track": "true",
          },
        },
      ]
    : [],

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/chtnnh/know-code/tree/main/website/",
          // lastVersion defaults to versions.json[0] (newest cut). Do not
          // set lastVersion: "current" — that would make HEAD the default.
          includeCurrentVersion: true,
          versions: {
            current: {
              label: "HEAD",
              path: "HEAD",
              banner: "unreleased",
              noIndex: true,
            },
          },
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/logo.svg",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "know-code",
      logo: {
        alt: "know-code",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          type: "docsVersionDropdown",
          position: "right",
          dropdownActiveClassDisabled: true,
        },
        {
          href: "https://github.com/chtnnh/know-code",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting started", to: "/" },
            { label: "CI & GitHub Action", to: "/ci" },
            { label: "CLI reference", to: "/cli" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/chtnnh/know-code",
            },
            {
              label: "npm",
              href: "https://www.npmjs.com/package/@chtnnh/know-code",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} chtnnh. MIT.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
