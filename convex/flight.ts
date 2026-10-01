import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const ICAO24 = "44bb57";
const CALLSIGN = "OO-NZW";

type AcRecord = {
  hex?: string;
  flight?: string;
  r?: string;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
  squawk?: string;
  emergency?: string;
  on_ground?: boolean | number;
  ground?: boolean | number;
};

// Resolve callsign / registration / ICAO24 → { icao24, label }
export const resolveAircraft = action({
  args: { query: v.string() },
  handler: async (_ctx, args): Promise<{ icao24: string; label: string } | null> => {
    const q = args.query.trim();
    // 6-char hex → direct ICAO24
    if (/^[0-9a-fA-F]{6}$/.test(q)) {
      return { icao24: q.toLowerCase(), label: q.toUpperCase() };
    }
    // Try callsign search
    const callsign = q.toUpperCase().replace(/\s/g, "");
    const csRes = await fetch(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`, {
      headers: { Accept: "application/json" },
    });
    if (csRes.ok) {
      const csData = await csRes.json() as { ac?: AcRecord[] };
      const ac = csData?.ac?.[0];
      if (ac?.hex) return { icao24: ac.hex.toLowerCase(), label: callsign };
    }
    // Try registration search
    const regRes = await fetch(`https://api.adsb.lol/v2/reg/${encodeURIComponent(q.toUpperCase())}`, {
      headers: { Accept: "application/json" },
    });
    if (regRes.ok) {
      const regData = await regRes.json() as { ac?: AcRecord[] };
      const ac = regData?.ac?.[0];
      if (ac?.hex) {
        const label = (ac.r ?? q).toUpperCase();
        return { icao24: ac.hex.toLowerCase(), label };
      }
    }
    return null;
  },
});

// Fetch live flight data from adsb.lol — optional icao24 override for custom tracking
export const fetchLiveData = action({
  args: { icao24Override: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{
    found: boolean;
    onGround: boolean;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    lat: number | null;
    lon: number | null;
    squawk: string | null;
    emergency: string | null;
    timestamp: number;
  }> => {
    const url = `https://api.adsb.lol/v2/icao/${args.icao24Override ?? ICAO24}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      return {
        found: false, onGround: true,
        altitude: null, speed: null, heading: null,
        lat: null, lon: null, squawk: null, emergency: null,
        timestamp: Date.now(),
      };
    }
    const data = await res.json() as {
      ac?: Array<{
        flight?: string;
        alt_baro?: number | string;
        gs?: number;
        track?: number;
        lat?: number;
        lon?: number;
        squawk?: string;
        emergency?: string;
        on_ground?: boolean | number;
        ground?: boolean | number;
      }>;
    };
    const ac = data?.ac?.[0];
    if (!ac) {
      return {
        found: false, onGround: true,
        altitude: null, speed: null, heading: null,
        lat: null, lon: null, squawk: null, emergency: null,
        timestamp: Date.now(),
      };
    }
    const altRaw = ac.alt_baro;
    const altitude = typeof altRaw === "number" ? altRaw : null;
    const onGround = ac.on_ground === true || ac.on_ground === 1 || ac.ground === true || altitude === 0;

    return {
      found: true,
      onGround: onGround ?? false,
      altitude,
      speed: ac.gs ?? null,
      heading: ac.track ?? null,
      lat: ac.lat ?? null,
      lon: ac.lon ?? null,
      squawk: ac.squawk ?? null,
      emergency: ac.emergency ?? null,
      timestamp: Date.now(),
    };
  },
});

// Save flight state snapshot to DB
export const saveSnapshot = mutation({
  args: {
    found: v.boolean(),
    onGround: v.boolean(),
    altitude: v.union(v.number(), v.null()),
    speed: v.union(v.number(), v.null()),
    heading: v.union(v.number(), v.null()),
    lat: v.union(v.number(), v.null()),
    lon: v.union(v.number(), v.null()),
    squawk: v.union(v.string(), v.null()),
    emergency: v.union(v.string(), v.null()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("flightSnapshots", args);
  },
});

// Get latest snapshot
export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("flightSnapshots")
      .order("desc")
      .first();
  },
});

// Get recent trail points (airborne only, last 60 snapshots with valid lat/lon)
export const getTrail = query({
  args: {},
  handler: async (ctx) => {
    const snapshots = await ctx.db
      .query("flightSnapshots")
      .order("desc")
      .take(80);
    // Keep only airborne points with valid coords, reverse to oldest-first
    return snapshots
      .filter(s => s.found && !s.onGround && s.lat !== null && s.lon !== null)
      .slice(0, 60)
      .reverse()
      .map(s => ({ lat: s.lat as number, lon: s.lon as number }));
  },
});

// Get recent event log (last 20)
export const getEventLog = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("flightEvents")
      .order("desc")
      .take(20);
  },
});

// Save event to log + broadcast push notification to all subscribers
export const saveEvent = mutation({
  args: {
    type: v.string(),
    message: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("flightEvents", args);

    // Send push notification on key status changes
    if (args.type === "airborne" || args.type === "landed") {
      const titles: Record<string, string> = {
        airborne: "✈ AIRBORNE — Frances Dell",
        landed: "Mission abgeschlossen",
      };
      const bodies: Record<string, string> = {
        airborne: "Frances Dell ist in der Luft!",
        landed: "Motor aus. Propeller läuft aus. Hangartor schließt sich.",
      };
      await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, {
        title: titles[args.type] ?? args.type,
        body: bodies[args.type] ?? args.message,
        urgency: args.type === "airborne" ? "high" : "normal",
      });
    }
  },
});

// Start a new flight session (called on takeoff). No-ops if a flight is
// already open — this makes it safe to call every poll, not just on the
// exact transition detected in one browser session.
export const startFlight = mutation({
  args: { takeoffTime: v.number() },
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("flights")
      .withIndex("by_takeoff")
      .order("desc")
      .first();
    if (open && open.landingTime === null) {
      // Already tracking an open flight — nothing to do.
      return;
    }
    await ctx.db.insert("flights", {
      takeoffTime: args.takeoffTime,
      landingTime: null,
      maxAltitude: null,
      maxSpeed: null,
      durationMs: null,
    });
  },
});

// Update in-flight stats (altitude, speed)
export const updateFlight = mutation({
  args: {
    altitude: v.union(v.number(), v.null()),
    speed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("flights")
      .withIndex("by_takeoff")
      .order("desc")
      .first();
    if (!open || open.landingTime !== null) return;
    const patch: { maxAltitude?: number; maxSpeed?: number } = {};
    if (args.altitude !== null && (open.maxAltitude === null || args.altitude > open.maxAltitude)) {
      patch.maxAltitude = args.altitude;
    }
    if (args.speed !== null && (open.maxSpeed === null || args.speed > open.maxSpeed)) {
      patch.maxSpeed = args.speed;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(open._id, patch);
  },
});

// Land — close the open flight session. Safe to call any time the aircraft
// is confirmed not airborne (idempotent no-op if nothing is open), so a
// stale open flight from a missed transition always gets closed eventually.
export const landFlight = mutation({
  args: { landingTime: v.number() },
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("flights")
      .withIndex("by_takeoff")
      .order("desc")
      .first();
    if (!open || open.landingTime !== null) return;
    await ctx.db.patch(open._id, {
      landingTime: args.landingTime,
      durationMs: args.landingTime - open.takeoffTime,
    });
  },
});

// Get last 5 completed flights
export const getLastFlights = query({
  args: {},
  handler: async (ctx) => {
    const fromFlights = await ctx.db
      .query("flights")
      .withIndex("by_takeoff")
      .order("desc")
      .take(5);

    const completed = fromFlights.filter(f => f.landingTime !== null);
    if (completed.length > 0) return completed;

    // Fallback: reconstruct from flightEvents if flights table is empty
    const events = await ctx.db
      .query("flightEvents")
      .order("desc")
      .take(200);

    type ReconFlight = {
      _id: string;
      takeoffTime: number;
      landingTime: number | null;
      maxAltitude: number | null;
      maxSpeed: number | null;
      durationMs: number | null;
    };

    const reconstructed: ReconFlight[] = [];
    let landingTime: number | null = null;

    for (const evt of events) {
      if (evt.type === "landed" || evt.type === "hangar") {
        if (!landingTime) landingTime = evt.timestamp;
      } else if (evt.type === "airborne" && landingTime !== null) {
        reconstructed.push({
          _id: evt._id,
          takeoffTime: evt.timestamp,
          landingTime,
          durationMs: landingTime - evt.timestamp,
          maxAltitude: null,
          maxSpeed: null,
        });
        landingTime = null;
        if (reconstructed.length >= 5) break;
      }
    }

    return reconstructed;
  },
});
