import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import TopNav from "@/components/TopNav";
import BottomTabs from "@/components/BottomTabs";
import GlowBackground from "@/components/GlowBackground";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "The Masters Pool",
  description: "Pick your Masters Tournament team and compete with friends",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} antialiased min-h-screen`}>
        <GlowBackground />
        <TopNav user={user} />
        <main className="relative z-10 w-full max-w-6xl 3xl:max-w-7xl 4xl:max-w-screen-2xl mx-auto px-3 xs:px-4 py-6 pb-24 md:pb-8 3xl:px-8 4xl:px-12">
          {children}
        </main>
        <BottomTabs />
      </body>
    </html>
  );
}
