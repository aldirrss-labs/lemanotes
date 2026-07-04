import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemaNotes",
  description:
    "LemaNotes — catatan markdown dengan notebook, sub-notebook, dan backup ke Google Drive.",
};

// Set tema sebelum paint untuk mencegah flash (FOUC).
const themeScript = `
try {
  var t = localStorage.theme;
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}