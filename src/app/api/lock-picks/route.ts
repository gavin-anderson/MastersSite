import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TOURNAMENT_YEAR } from "@/types";

export async function GET(request: Request) {
  // Validate cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("tournament_config")
    .upsert(
      { year: TOURNAMENT_YEAR, picks_locked: true },
      { onConflict: "year" }
    );

  if (error) {
    console.error("[lock-picks] Failed to lock picks:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[lock-picks] Picks locked for ${TOURNAMENT_YEAR}`);
  return NextResponse.json({
    message: `Picks locked for ${TOURNAMENT_YEAR}`,
    timestamp: new Date().toISOString(),
  });
}
