import "./globals.css";

export const metadata = {
  title: "SmartCampus CHMSU",
  description:
    "Multi-campus information kiosk, student portal, announcement publisher, and QR document tracking system for Carlos Hilado Memorial State University.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-chmsu-canvas text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
