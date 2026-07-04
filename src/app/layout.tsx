import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemaNotes",
  description:
    "LemaNotes — markdown notes with notebooks, sub-notebooks, and Google Drive backup.",
  manifest: "/manifest.json",
};

// Set theme before paint to prevent a flash (FOUC).
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