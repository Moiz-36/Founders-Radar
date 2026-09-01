import "./globals.css";

export const metadata = {
  title: "Founder's Radar",
  description: "Competitive intelligence reports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
