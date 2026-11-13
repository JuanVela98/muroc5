# 💡 Muro de Ideas en Vivo

Cada persona entra con correo y contraseña, publica ideas cortas (máx. 280 caracteres), da like, y todos ven las ideas en vivo. Arriba hay un contador de personas conectadas en tiempo real.

Hecho con Next.js + Supabase (Auth, base de datos, Realtime y Presence).

## Correrlo en tu computador

1. Crea `.env.local` con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```
2. En Supabase → SQL Editor, ejecuta `supabase/schema.sql`.
3. `npm install` y luego `npm run dev`. Abre http://localhost:3000.
