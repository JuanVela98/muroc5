import { createClient } from "@supabase/supabase-js";

// Estos dos valores son públicos (los ve cualquier navegador que abra la app),
// así que es seguro dejarlos como respaldo si no hay variables de entorno.
// La seguridad de los datos la dan las reglas RLS de supabase/schema.sql.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qjoyldcghjeylgvgdbsp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_o2V_PLUtWx7vWqX27p8N6Q_wROBSemb";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
