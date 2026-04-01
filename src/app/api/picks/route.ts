import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TOURNAMENT_YEAR } from "@/types";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("picks")
    .select("*")
    .eq("user_id", user.id)
    .eq("year", TOURNAMENT_YEAR)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ picks: data });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Check global tournament lock first
  const { data: config } = await supabase
    .from("tournament_config")
    .select("picks_locked")
    .eq("year", TOURNAMENT_YEAR)
    .single();

  if (config?.picks_locked) {
    return NextResponse.json(
      { error: "Picks are locked — tournament has started" },
      { status: 403 }
    );
  }

  // Check per-user lock (fallback)
  const { data: existing } = await supabase
    .from("picks")
    .select("locked")
    .eq("user_id", user.id)
    .eq("year", TOURNAMENT_YEAR)
    .single();

  if (existing?.locked) {
    return NextResponse.json(
      { error: "Picks are locked — tournament has started" },
      { status: 403 }
    );
  }

  const { error } = await supabase.from("picks").upsert({
    user_id: user.id,
    year: TOURNAMENT_YEAR,
    usa_pick: body.usa_pick ?? null,
    european_pick: body.european_pick ?? null,
    asian_pick: body.asian_pick ?? null,
    longshot_pick: body.longshot_pick ?? null,
    liv_pick: body.liv_pick ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
