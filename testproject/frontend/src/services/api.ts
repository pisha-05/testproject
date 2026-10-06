import { 
  Place, RouteResult, CommunityReport, EventZone, 
  MobilityProfileCode, SearchResult, AccessibilityLookupResult 
} from '../types';

const API_BASE = 'http://localhost:8000/api';

// Short-lived search suggestion cache (60 seconds TTL)
const searchCache = new Map<string, { timestamp: number; data: SearchResult[] }>();
const CACHE_TTL_MS = 60 * 1000;

export async function searchLocationsApi(
  query: string,
  lat?: number,
  lon?: number,
  limit: number = 8,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  // Generate cache key based on query + rounded proximity coordinates
  const latKey = lat !== undefined ? lat.toFixed(2) : 'none';
  const lonKey = lon !== undefined ? lon.toFixed(2) : 'none';
  const cacheKey = `${cleanQuery.toLowerCase()}_${latKey}_${lonKey}_${limit}`;

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams({
      text: cleanQuery,
      limit: Math.min(Math.max(limit, 1), 8).toString(),
    });
    if (lat !== undefined && lon !== undefined) {
      params.append('lat', lat.toString());
      params.append('lon', lon.toString());
    }

    const res = await fetch(`${API_BASE}/search/suggest?${params.toString()}`, { signal });
    if (!res.ok) throw new Error(`Search request failed with status: ${res.status}`);

    const data = await res.json();
    const results: SearchResult[] = data.results || [];

    // Store in cache
    searchCache.set(cacheKey, { timestamp: Date.now(), data: results });

    // Evict oldest entries if cache exceeds 100 entries
    if (searchCache.size > 100) {
      const firstKey = searchCache.keys().next().value;
      if (firstKey) searchCache.delete(firstKey);
    }

    return results;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    console.warn('Search API call failed, falling back to local POI index:', err);
    // Fallback search against local verified POIs
    const localPlaces = getFallbackPlaces(cleanQuery);
    return localPlaces.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      city: p.city,
      latitude: p.latitude,
      longitude: p.longitude,
      type: p.category,
      category: p.category,
    }));
  }
}

export async function lookupAccessibilityApi(
  lat: number,
  lon: number,
  name?: string
): Promise<AccessibilityLookupResult> {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
    });
    if (name) params.append('name', name);

    const res = await fetch(`${API_BASE}/search/accessibility?${params.toString()}`);
    if (!res.ok) throw new Error('Accessibility lookup failed');
    return await res.json();
  } catch (err) {
    console.warn('Accessibility lookup offline fallback:', err);
    return {
      has_data: false,
      verified: false,
      name: name,
      message: 'Accessibility information unavailable',
      nearby_ramps: 0,
      nearby_elevators: 0,
      nearby_tactile_paths: 0,
    };
  }
}

export async function fetchPlaces(query?: string, city?: string): Promise<Place[]> {
  try {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (city) params.append('city', city);
    const res = await fetch(`${API_BASE}/places?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch places');
    return await res.json();
  } catch (err) {
    console.warn('Backend offline, using client-side POI dataset', err);
    return getFallbackPlaces(query, city);
  }
}

export async function fetchReports(lat?: number, lng?: number): Promise<CommunityReport[]> {
  try {
    const params = new URLSearchParams();
    if (lat) params.append('lat', lat.toString());
    if (lng) params.append('lng', lng.toString());
    const res = await fetch(`${API_BASE}/reports?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch reports');
    return await res.json();
  } catch (err) {
    console.warn('Backend offline, using local reports store', err);
    return getFallbackReports();
  }
}

export async function submitReportApi(data: {
  category: string;
  title: string;
  description: string;
  severity: string;
  lat: number;
  lng: number;
}): Promise<CommunityReport> {
  try {
    const res = await fetch(`${API_BASE}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to submit report');
    return await res.json();
  } catch (err) {
    console.warn('Using client report fallback', err);
    return {
      id: 'local-' + Date.now(),
      category: data.category as any,
      title: data.title,
      description: data.description,
      severity: data.severity as any,
      latitude: data.lat,
      longitude: data.lng,
      status: 'UNVERIFIED',
      upvotes: 1,
      downvotes: 0,
      confidence_level: 'UNVERIFIED',
      reported_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };
  }
}

export async function voteReportApi(reportId: string, voteType: 'upvote' | 'downvote' | 'resolve'): Promise<CommunityReport> {
  try {
    const res = await fetch(`${API_BASE}/reports/${reportId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote_type: voteType }),
    });
    if (!res.ok) throw new Error('Failed to vote');
    return await res.json();
  } catch (err) {
    throw err;
  }
}

export async function fetchEvents(): Promise<EventZone[]> {
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error('Failed to fetch events');
    return await res.json();
  } catch (err) {
    return getFallbackEvents();
  }
}

export async function calculateRoutesApi(
  origin: [number, number],
  destination: [number, number],
  profile: MobilityProfileCode,
  originName?: string,
  destinationName?: string
): Promise<{ routes: RouteResult[] }> {
  const res = await fetch(`${API_BASE}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destination,
      profile,
      origin_name: originName || 'Origin',
      destination_name: destinationName || 'Destination',
    }),
  });

  if (!res.ok) {
    let errorDetail = 'Unable to calculate a route right now. Please check your connection and try again.';
    try {
      const errorJson = await res.json();
      if (errorJson?.detail) errorDetail = errorJson.detail;
    } catch {}
    throw new Error(errorDetail);
  }

  const data = await res.json();
  if (!data?.routes || data.routes.length === 0) {
    throw new Error('No accessible routes found for the selected locations.');
  }
  return data;
}

export async function calculateRerouteApi(
  currentLocation: [number, number],
  destination: [number, number],
  profile: MobilityProfileCode
): Promise<RouteResult> {
  const res = await fetch(`${API_BASE}/routes/reroute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_location: currentLocation,
      destination,
      profile,
    }),
  });

  if (!res.ok) {
    let errorDetail = 'Unable to calculate a detour route right now.';
    try {
      const errorJson = await res.json();
      if (errorJson?.detail) errorDetail = errorJson.detail;
    } catch {}
    throw new Error(errorDetail);
  }

  return await res.json();
}

// Fallback datasets
function getFallbackPlaces(query?: string, city?: string): Place[] {
  const all: Place[] = [
    {
      id: 'delhi-1',
      name: 'Connaught Place Central Park & Metro Interchange',
      category: 'transit',
      address: 'Connaught Place Inner Circle, New Delhi',
      latitude: 28.6328,
      longitude: 77.2197,
      city: 'New Delhi',
      accessibility: {
        has_accessible_entrance: true,
        has_ramp: true,
        has_elevator: true,
        has_tactile_paving: true,
        elevator_status: 'operational',
        details: 'Gate 7 & Gate 8 equipped with certified ADA elevators and tactile guide paths.'
      }
    },
    {
      id: 'delhi-2',
      name: 'National Museum & Library',
      category: 'library',
      address: 'Janpath Rd, Rajpath Area, Central Secretariat, New Delhi',
      latitude: 28.6117,
      longitude: 77.2193,
      city: 'New Delhi',
      accessibility: {
        has_accessible_entrance: true,
        has_ramp: true,
        has_elevator: true,
        has_tactile_paving: true,
        elevator_status: 'operational',
        details: 'Ground-level step-free ramp entrance at Main Gate. Braille signage available.'
      }
    },
    {
      id: 'delhi-3',
      name: 'All India Institute of Medical Sciences (AIIMS)',
      category: 'hospital',
      address: 'Sri Aurobindo Marg, Ansari Nagar, New Delhi',
      latitude: 28.5672,
      longitude: 77.2100,
      city: 'New Delhi',
      accessibility: {
        has_accessible_entrance: true,
        has_ramp: true,
        has_elevator: true,
        has_tactile_paving: true,
        elevator_status: 'operational',
        details: '24/7 designated emergency wheelchair ramp and motorized buggy transit.'
      }
    },
    {
      id: 'sf-1',
      name: 'San Francisco Ferry Building',
      category: 'transit',
      address: '1 Ferry Building, San Francisco, CA 94111',
      latitude: 37.7955,
      longitude: -122.3937,
      city: 'San Francisco',
      accessibility: {
        has_accessible_entrance: true,
        has_ramp: true,
        has_elevator: true,
        has_tactile_paving: true,
        elevator_status: 'operational',
        details: 'Fully step-free waterfront promenade with automatic power doors.'
      }
    }
  ];
  if (query) {
    const q = query.toLowerCase();
    return all.filter(p => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q));
  }
  return all;
}

function getFallbackReports(): CommunityReport[] {
  return [
    {
      id: 'rep-1',
      category: 'broken_ramp',
      title: 'Damaged Ramp Curb at Janpath Crossing',
      description: 'The concrete ramp is cracked with a 3-inch drop, hazardous for manual wheelchairs.',
      severity: 'severe',
      latitude: 28.6250,
      longitude: 77.2185,
      status: 'CONFIRMED',
      upvotes: 6,
      downvotes: 0,
      confidence_level: 'HIGH',
      reported_at: new Date(Date.now() - 45 * 60000).toISOString(),
      last_verified_at: new Date(Date.now() - 10 * 60000).toISOString(),
      expires_at: new Date(Date.now() + 20 * 3600000).toISOString(),
    },
    {
      id: 'rep-2',
      category: 'broken_elevator',
      title: 'Barakhamba Metro Gate 3 Elevator Offline',
      description: 'Maintenance sign posted on the lift doors. Use Gate 1 ramp instead.',
      severity: 'critical',
      latitude: 28.6300,
      longitude: 77.2260,
      status: 'CONFIRMED',
      upvotes: 9,
      downvotes: 1,
      confidence_level: 'HIGH',
      reported_at: new Date(Date.now() - 120 * 60000).toISOString(),
      last_verified_at: new Date(Date.now() - 25 * 60000).toISOString(),
      expires_at: new Date(Date.now() + 14 * 3600000).toISOString(),
    }
  ];
}

function getFallbackEvents(): EventZone[] {
  return [
    {
      id: 'event-rally-1',
      title: 'Civic Teachers Association Peaceful Assembly',
      event_type: 'rally',
      risk_level: 'high',
      crowd_density: 'High Density (>3500 people)',
      description: 'Public gathering along Jantar Mantar Road. Pedestrian corridors completely blocked.',
      polygon: [
        [28.6255, 77.2140],
        [28.6285, 77.2180],
        [28.6240, 77.2200],
        [28.6220, 77.2150]
      ],
      detour_corridor: [
        [28.6328, 77.2197],
        [28.6300, 77.2260],
        [28.6180, 77.2250],
        [28.6117, 77.2193]
      ],
      is_active: true
    }
  ];
}


