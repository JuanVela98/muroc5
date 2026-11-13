import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GradientWave } from "@/components/ui/gradient-wave";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Muro de Ideas en Vivo",
  description: "Publica ideas cortas y velas aparecer en vivo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Fondo interactivo: mesh gradient animado que reacciona al puntero */}
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <GradientWave
            colors={[
              "#050816", // base: casi negro azulado
              "#4f46e5", // capa 1: índigo
              "#7c3aed", // capa 2: violeta
              "#0ea5e9", // capa 3: cielo
              "#ec4899", // capa 4: rosa
            ]}
            noiseSpeed={1e-5}
            noiseFrequency={[1e-4, 9e-4]}
            deform={{ incline: 0.5, noiseAmp: 250, noiseFlow: 5 }}
            shadowPower={8}
          />
          {/* Viñeta para dar profundidad y contraste al contenido */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(2,6,23,0.6)_100%)]" />
        </div>
        {children}
      </body>
    </html>
  );
}
