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
              "#0b1026", // base: azul noche profundo
              "#1d4ed8", // capa 1: azul vivo
              "#312e81", // capa 2: índigo
              "#0ea5e9", // capa 3: cielo
              "#4338ca", // capa 4: violeta
              "#22d3ee", // capa 5: cian
            ]}
            noiseSpeed={1e-5}
            noiseFrequency={[1e-4, 9e-4]}
            deform={{ incline: 0.5, noiseAmp: 250, noiseFlow: 5 }}
            shadowPower={8}
          />
          {/* Viñeta sutil para dar profundidad y contraste al contenido */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(2,6,23,0.55)_100%)]" />
        </div>
        {children}
      </body>
    </html>
  );
}
