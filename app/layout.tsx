import "./globals.css";

export const metadata = { title: "Contentful Governance Console" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-* attributes on <body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
