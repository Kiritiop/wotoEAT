import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML shell for web (used by `expo export --platform web`).
 *
 * Exists chiefly to fix the mobile-browser viewport bug: browsers size 100vh
 * to the LARGE viewport (as if the URL bar were hidden), so an app shell laid
 * out against it puts the bottom tab bar behind the browser chrome — cut off
 * and unreachable, since the shell itself doesn't scroll (inner lists do).
 * `100dvh` tracks the actually-visible viewport as the URL bar shows/hides.
 * `viewport-fit=cover` additionally enables safe-area env() insets on iOS
 * Safari so the tab bar's inset-aware padding clears the home indicator.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* Static SEO/share metadata — messengers and crawlers don't run JS,
            so without these every shared /share/<id> link renders as a bare
            URL. Site-level tags give all links a proper preview card. */}
        <title>wotoEAT — What to Eat</title>
        <meta
          name="description"
          content="AI-powered meal planning: real dishes from what's in your pantry, tailored to your health goals and taste."
        />
        <meta property="og:site_name" content="wotoEAT" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="wotoEAT — What to Eat" />
        <meta
          property="og:description"
          content="AI-powered meal planning: real dishes from what's in your pantry, tailored to your health goals and taste."
        />
        <meta property="og:image" content="https://wotoeat.com/og.png" />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:image:alt" content="wotoEAT" />
        <meta name="twitter:card" content="summary" />
        <meta name="theme-color" content="#16A34A" />
        {/* Structured data. Static and site-level on purpose: it describes the
            app itself, which is the only thing here that is stable enough to
            describe. Recipe schema is deliberately absent — every recipe page
            is either generated per request or a private /share snapshot, so
            there is no durable recipe URL to attach it to. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
        />
        {/* Canonical has to be per URL, and every route is exported from this
            one shell, so it cannot be a static href. Google renders JS before
            indexing, so injecting it here is enough. */}
        <script dangerouslySetInnerHTML={{ __html: CANONICAL_SCRIPT }} />
        {/* Disable body scrolling — ScrollViews handle their own scrolling. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "wotoEAT",
  alternateName: "What to Eat",
  url: "https://wotoeat.com/",
  description:
    "AI-powered meal planning: real dishes from what's in your pantry, tailored to your health goals and taste.",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web, iOS, Android",
  inLanguage: ["en", "zh-Hans"],
  featureList: [
    "Generate a real, cookable dish from the ingredients you already have",
    "Scan a grocery receipt to fill your pantry",
    "Build a shopping list with pantry items subtracted",
    "Honour allergies and dietary restrictions",
  ],
};

const CANONICAL_SCRIPT = `(function(){try{var p=location.pathname.replace(/\\/+$/,"")||"/";var l=document.createElement("link");l.rel="canonical";l.href=location.origin+p;document.head.appendChild(l);}catch(e){}})();`;

const css = `
html, body, #root {
  height: 100%;
}
/* Visible-viewport sizing where supported (all modern mobile browsers). */
@supports (height: 100dvh) {
  html, body, #root {
    height: 100dvh;
  }
}
body {
  overflow: hidden;
  overscroll-behavior-y: none; /* no rubber-band pulling the shell around */
  background-color: #FBF7F0;   /* brand cream behind safe areas / load flash */
}

/* Desktop web only: react-native-web renders Touchables as plain divs with no
   hover feedback, so on a pointer device every control feels dead. Opacity
   mirrors what TouchableOpacity already does on press. */
@media (hover: hover) and (pointer: fine) {
  [role="button"]:hover, [role="link"]:hover {
    opacity: 0.82;
    transition: opacity 120ms ease;
  }
}

/* People print recipes. Without this nothing past the first screen prints at
   all: the shell is height-capped with overflow:hidden so the printer only
   ever sees the visible viewport. */
@media print {
  html, body, #root {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  * {
    overflow: visible !important;
    /* Keep the ink cheap and the text readable on white. */
    -webkit-print-color-adjust: economy;
    print-color-adjust: economy;
  }
}
`;
