import "./globals.css";

export const metadata = {
  title: "Cover Crazy",
  description: "Album cover bingo game"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
