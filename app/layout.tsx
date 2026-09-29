import "./globals.css";

export const metadata = { title: "Wish Engine prototype" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="default">
      <body>{children}</body>
    </html>
  );
}
