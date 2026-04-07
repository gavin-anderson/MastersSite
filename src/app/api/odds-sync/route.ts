import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Syncs outright winner odds from The Odds API into the golfers table.
// Runs every 6 hours via Vercel Cron. Free tier: 500 req/month.

const ODDS_API_URL =
  "https://api.the-odds-api.com/v4/sports/golf_masters_tournament_winner/odds";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const res = await fetch(
      `${ODDS_API_URL}?regions=us&markets=outrights&oddsFormat=american&apiKey=${apiKey}`,
      { next: { revalidate: 0 } }
    );

    if (!res.ok) {
      const remaining = res.headers.get("x-requests-remaining");
      return NextResponse.json(
        {
          error: `Odds API error: ${res.status}`,
          requestsRemaining: remaining,
        },
        { status: 502 }
      );
    }

    const events = await res.json();
    const remaining = res.headers.get("x-requests-remaining");

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({
        message:
          "No Masters odds available — tournament may not be upcoming",
        requestsRemaining: remaining,
      });
    }

    // Aggregate odds across bookmakers: keep the best (highest) American odds per player
    const playerOdds = new Map<string, number>();

    for (const event of events) {
      for (const bookmaker of event.bookmakers ?? []) {
        for (const market of bookmaker.markets ?? []) {
          if (market.key !== "outrights") continue;
          for (const outcome of market.outcomes ?? []) {
            const name = outcome.name as string;
            const price = outcome.price as number;
            const existing = playerOdds.get(name);
            if (existing === undefined || price > existing) {
              playerOdds.set(name, price);
            }
          }
        }
      }
    }

    if (playerOdds.size === 0) {
      return NextResponse.json({
        message: "No outright odds found in response",
        requestsRemaining: remaining,
      });
    }

    // Batch update: build array then update each golfer by name
    let updated = 0;
    const unmatched: string[] = [];

    for (const [name, odds] of playerOdds) {
      const { count } = await supabase
        .from("golfers")
        .update({ odds, updated_at: new Date().toISOString() })
        .eq("name", name);

      if (count && count > 0) {
        updated++;
      } else {
        unmatched.push(name);
      }
    }

    return NextResponse.json({
      message: `Updated odds for ${updated} golfers`,
      totalFromApi: playerOdds.size,
      unmatched: unmatched.length > 0 ? unmatched : undefined,
      requestsRemaining: remaining,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[odds-sync] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
