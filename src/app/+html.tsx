import { ScrollViewStyleReset } from 'expo-router/html';
import React, { type PropsWithChildren } from 'react';

/**
 * The HTML shell for the website build only. Native is unaffected — this file
 * is never bundled into the phone app.
 *
 * The app's bold weights are drawn thinner and greyer by default in a browser
 * than on a phone, so antialiasing is forced on here; it is the difference
 * between the headings looking crisp and looking slightly smudged.
 */
const globalStyles = `
  html, body {
    margin: 0;
    padding: 0;
    /* Matches the app's dark background so there is no white flash on load. */
    background-color: #020706;
  }

  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  /* Keeps long words and references from spilling out of narrow cards. */
  * {
    overflow-wrap: break-word;
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>{process.env.EXPO_PUBLIC_APP_ENV === 'test' ? '[TEST] MYPitch — Pitch Owner' : 'MYPitch — Pitch Owner'}</title>

        {/* Stops the body scrolling behind the app on web. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
