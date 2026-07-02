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
        {/* Disable body scrolling — ScrollViews handle their own scrolling. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

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
`;
