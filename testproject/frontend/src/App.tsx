import React, { useState, useEffect, useRef } from 'react';
import { MapView } from './components/Map/MapView';
import { MapControls } from './components/Map/MapControls';
import { AppHeader } from './components/Navigation/AppHeader';
import { GlobalSidebar, SidebarSection } from './components/Navigation/GlobalSidebar';
import { CommandPalette } from './components/Navigation/CommandPalette';
import { SavedPlacesModal } from './components/Navigation/SavedPlacesModal';
import { SettingsModal } from './components/Navigation/SettingsModal';
import { FloatingSearchBar } from './components/Search/FloatingSearchBar';
import { PlaceDetailsCard } from './components/Directions/PlaceDetailsCard';
import { DirectionsPanel } from './components/Directions/DirectionsPanel';
import { MobilityProfileSelector } from './components/Directions/MobilityProfileSelector';
import { RouteResultsSheet } from './components/Directions/RouteResultsSheet';
import { NavigationHUD } from './components/Navigation/NavigationHUD';
import { ObstacleAlertModal } from './components/Navigation/ObstacleAlertModal';
import { ReportModal } from './components/Crowdsourcing/ReportModal';
import { VerificationDrawer } from './components/Crowdsourcing/VerificationDrawer';
import { ScreenReaderTable } from './components/Accessibility/ScreenReaderTable';
import { VoiceWelcomeModal } from './components/Voice/VoiceWelcomeModal';
import { VoiceAssistantHUD } from './components/Voice/VoiceAssistantHUD';
import { VoiceOrb } from './components/Voice/VoiceOrb';
import { DeveloperDebugPanel } from './components/Navigation/DeveloperDebugPanel';
import { 
  Place, RouteResult, CommunityReport, EventZone, 
  MapLayerConfig, MobilityProfileCode, ReportCategory, SearchResult 
} from './types';
import { 
  fetchPlaces, fetchReports, submitReportApi, 
  voteReportApi, fetchEvents, calculateRoutesApi, calculateRerouteApi,
  lookupAccessibilityApi, searchLocationsApi 
} from './services/api';
import { calculateDistanceKm, distanceToPolylineMeters } from './utils/geo';
import { voiceAssistant, VoiceState, VoiceIntent } from './services/voiceAssistant';
import { AlertCircle, X, Sparkles } from 'lucide-react';

// City Presets
const CITY_CENTERS: Record<string, { center: [number, number]; zoom: number }> = {
  'New Delhi': { center: [28.6289, 77.2185], zoom: 15 },
  'San Francisco': { center: [37.7885, -122.4072], zoom: 14 },
  'London': { center: [51.5250, -0.1250], zoom: 14 },
};

export const App: React.FC = () => {
  const [selectedCity, setSelectedCity] = useState('New Delhi');
  const [mapCenter, setMapCenter] = useState<[number, number]>(CITY_CENTERS['New Delhi'].center);
  const [mapZoom, setMapZoom] = useState(CITY_CENTERS['New Delhi'].zoom);
  const [userLocation, setUserLocation] = useState<[number, number]>([28.6340, 77.2160]);
  const [searchBias, setSearchBias] = useState<[number, number] | undefined>(undefined);
  const [showSearchThisArea, setShowSearchThisArea] = useState(false);

  // Data states
  const [places, setPlaces] = useState<Place[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [events, setEvents] = useState<EventZone[]>([]);
  
  // Selection states
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedReport, setSelectedReport] = useState<CommunityReport | null>(null);
  const [mobilityProfile, setMobilityProfile] = useState<MobilityProfileCode>(() => {
    try {
      const saved = localStorage.getItem('accessroute_preferred_profile') as MobilityProfileCode;
      if (saved && ['wheelchair', 'vision', 'pram_elderly', 'walking', 'bicycle', 'scooter'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'wheelchair';
  });
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  
  // Navigation & Global Sidebar States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('accessroute_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [activeSidebarSection, setActiveSidebarSection] = useState<SidebarSection>('explore');
  const [showSavedPlacesModal, setShowSavedPlacesModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Toast Banner State
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Voice-First Accessibility States: showVoiceWelcome is ALWAYS true on startup/reload
  const [showVoiceWelcome, setShowVoiceWelcome] = useState<boolean>(true);
  const [isVoiceAssistantActive, setIsVoiceAssistantActive] = useState<boolean>(true);
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [voiceMessage, setVoiceMessage] = useState<string>('Welcome to AccessRoute Live. Where would you like to go?');
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceIsListening, setVoiceIsListening] = useState<boolean>(false);
  const [voiceIsMuted, setVoiceIsMuted] = useState<boolean>(false);
  const pendingVoiceActionRef = useRef<
    | { type: 'DESTINATION_CONFIRM'; place: Place }
    | { type: 'ROUTE_CONFIRM'; route: RouteResult }
    | { type: 'DETOUR_CONFIRM' }
    | { type: 'EMERGENCY_CONFIRM' }
    | null
  >(null);

  // UI Panels & Modals
  const [showDirectionsPanel, setShowDirectionsPanel] = useState(false);
  const [showProfileSelectorModal, setShowProfileSelectorModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showScreenReaderTable, setShowScreenReaderTable] = useState(false);
  const [showObstacleAlert, setShowObstacleAlert] = useState(false);

  // Live Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [navPosition, setNavPosition] = useState<[number, number] | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const navIntervalRef = useRef<any>(null);
  const isReroutingRef = useRef<boolean>(false);
  const activeRouteRef = useRef<RouteResult | null>(null);
  const selectedPlaceRef = useRef<Place | null>(null);
  const mobilityProfileRef = useRef<MobilityProfileCode>('wheelchair');

  // Map Layers & Accessibility
  const [layers, setLayers] = useState<MapLayerConfig>({
    showHazards: true,
    showRamps: true,
    showEvents: true,
    showTactile: true,
    highContrast: false,
    satelliteView: false,
  });

  // Keep references synced for real-time geolocation callbacks
  useEffect(() => {
    activeRouteRef.current = routes.find((r) => r.id === selectedRouteId) || routes[0] || null;
    selectedPlaceRef.current = selectedPlace;
    mobilityProfileRef.current = mobilityProfile;
  }, [routes, selectedRouteId, selectedPlace, mobilityProfile]);

  // Voice Assistant Callback & Intent Parser Setup
  useEffect(() => {
    voiceAssistant.setCallbacks(
      (state) => {
        setVoiceState(state);
        setVoiceIsListening(state === 'LISTENING');
      },
      (transcript, isFinal) => {
        setVoiceTranscript(transcript);
        if (isFinal) {
          setTimeout(() => setVoiceTranscript(''), 3000);
        }
      },
      (intent) => {
        handleVoiceIntent(intent);
      }
    );
  }, [places, routes, selectedRouteId, selectedPlace, mobilityProfile, isNavigating, userLocation]);

  // Browser Geolocation on initial load & live watch
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(coords);
          setMapCenter(coords);
          setMapZoom(15);
          setSearchBias(coords);
        },
        (err) => {
          console.debug('Location permission fallback:', err.message);
        },
        { timeout: 8000, enableHighAccuracy: true, maximumAge: 0 }
      );

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(coords);

          // Off-route detection when navigating
          if (isNavigating && activeRouteRef.current && selectedPlaceRef.current && !isReroutingRef.current) {
            const activeCoords = activeRouteRef.current.coordinates as [number, number][];
            const distOffRoute = distanceToPolylineMeters(coords, activeCoords);

            if (distOffRoute > 50) {
              isReroutingRef.current = true;
              const offRouteMsg = 'You are off route. Recalculating step-free corridor.';
              setVoiceMessage(offRouteMsg);
              voiceAssistant.speak(offRouteMsg);
              calculateRerouteApi(
                coords,
                [selectedPlaceRef.current.latitude, selectedPlaceRef.current.longitude],
                mobilityProfileRef.current
              )
                .then((newRoute) => {
                  setRoutes([newRoute]);
                  setSelectedRouteId(newRoute.id);
                  setCurrentStepIndex(0);
                  setRemainingDistance(newRoute.distance_meters);
                  setRemainingSeconds(newRoute.duration_seconds);
                  const rerunMsg = `New accessible route found. Takes ${newRoute.duration_minutes} minutes with ${newRoute.accessibility_breakdown.ramps_count} verified ramps.`;
                  setVoiceMessage(rerunMsg);
                  voiceAssistant.speak(rerunMsg);
                })
                .catch((e) => console.error('Off-route reroute error:', e))
                .finally(() => {
                  setTimeout(() => {
                    isReroutingRef.current = false;
                  }, 4000);
                });
            }
          }
        },
        (err) => {
          console.debug('Geolocation watch error:', err);
        },
        { enableHighAccuracy: true, maximumAge: 3000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isNavigating]);

  // Load initial data
  useEffect(() => {
    loadData(selectedCity);
  }, [selectedCity]);

  const loadData = async (city: string) => {
    const p = await fetchPlaces(undefined, city);
    const r = await fetchReports();
    const e = await fetchEvents();
    setPlaces(p);
    setReports(r);
    setEvents(e);
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    const cfg = CITY_CENTERS[city] || CITY_CENTERS['New Delhi'];
    setMapCenter(cfg.center);
    setMapZoom(cfg.zoom);
    setSearchBias(cfg.center);
    setShowSearchThisArea(false);
    setUserLocation([cfg.center[0] + 0.003, cfg.center[1] - 0.003]);
    setRoutes([]);
    setSelectedPlace(null);
    setSelectedReport(null);
    setShowDirectionsPanel(false);
  };

  const handleToggleCollapseDesktop = () => {
    setIsDesktopSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('accessroute_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleSelectProfile = (p: MobilityProfileCode) => {
    setMobilityProfile(p);
    try {
      localStorage.setItem('accessroute_preferred_profile', p);
    } catch {}
    if (selectedPlace) {
      handleCalculateRoutes('Your Location', selectedPlace, p);
    }
  };

  // Trigger real route computation
  const handleCalculateRoutes = async (
    originStr: string,
    targetPlace: Place,
    profile: MobilityProfileCode,
    options?: { avoidStairs: boolean; maxSlope: number }
  ) => {
    setIsCalculatingRoutes(true);
    setBannerMessage(null);
    try {
      const resp = await calculateRoutesApi(
        userLocation,
        [targetPlace.latitude, targetPlace.longitude],
        profile,
        originStr || 'Your Location',
        targetPlace.name
      );
      if (!resp?.routes || resp.routes.length === 0) {
        throw new Error('No accessible routes found for the selected destination.');
      }
      setRoutes(resp.routes);
      setSelectedRouteId(resp.routes[0]?.id || null);
      setShowDirectionsPanel(false);

      const topRoute = resp.routes[0];
      const km = (topRoute.distance_meters / 1000).toFixed(1);
      const ramps = topRoute.accessibility_breakdown.ramps_count;
      const stairs = topRoute.accessibility_breakdown.stairs_count;
      let accessClaim = 'This route avoids stairs and uses step-free paths where accessibility data is available.';
      if (stairs > 0) {
        accessClaim = `Please note this route contains ${stairs} steps.`;
      } else if (ramps > 0) {
        accessClaim = `This route includes ${ramps} verified accessible ramps and avoids stairs.`;
      }
      const routeSummary = `I found an accessible route. It is approximately ${km} kilometres and should take about ${topRoute.duration_minutes} minutes. ${accessClaim} Would you like to start navigation?`;
      setVoiceMessage(routeSummary);
      voiceAssistant.speak(routeSummary);
      pendingVoiceActionRef.current = { type: 'ROUTE_CONFIRM', route: topRoute };
    } catch (err: any) {
      console.error('Routing calculation failed', err);
      const errMsg = err?.message || 'Unable to calculate a route right now. Please check your connection and try again.';
      setBannerMessage(errMsg);
      setVoiceMessage(errMsg);
      voiceAssistant.speak(errMsg);
    } finally {
      setIsCalculatingRoutes(false);
    }
  };

  // Voice Intent Handler Loop
  const handleVoiceIntent = async (intent: VoiceIntent) => {
    switch (intent.type) {
      case 'CONFIRM_YES':
        if (pendingVoiceActionRef.current) {
          const action = pendingVoiceActionRef.current;
          pendingVoiceActionRef.current = null;
          if (action.type === 'DESTINATION_CONFIRM') {
            handleCalculateRoutes('Your Location', action.place, mobilityProfile);
          } else if (action.type === 'ROUTE_CONFIRM') {
            handleStartNavigation();
          } else if (action.type === 'DETOUR_CONFIRM') {
            handleAcceptDetour();
          } else if (action.type === 'EMERGENCY_CONFIRM') {
            triggerEmergencyMode();
          }
        } else if (routes.length > 0 && !isNavigating) {
          handleStartNavigation();
        } else {
          const msg = 'Understood. Where would you like to go next?';
          setVoiceMessage(msg);
          voiceAssistant.speak(msg);
        }
        break;

      case 'CONFIRM_NO':
        pendingVoiceActionRef.current = null;
        if (isNavigating) {
          const msg = 'Navigation continuing.';
          setVoiceMessage(msg);
          voiceAssistant.speak(msg);
        } else {
          const msg = 'Cancelled. Tell me another destination or ask for help.';
          setVoiceMessage(msg);
          voiceAssistant.speak(msg);
        }
        break;

      case 'SEARCH_DESTINATION': {
        const searchMsg = `Searching for ${intent.query}…`;
        setVoiceMessage(searchMsg);
        voiceAssistant.speak(searchMsg);
        try {
          const localMatch = places.find((p) =>
            p.name.toLowerCase().includes(intent.query.toLowerCase())
          );
          if (localMatch) {
            setSelectedPlace(localMatch);
            setMapCenter([localMatch.latitude, localMatch.longitude]);
            const foundMsg = `Found ${localMatch.name}. Calculating accessible route now.`;
            setVoiceMessage(foundMsg);
            voiceAssistant.speak(foundMsg);
            handleCalculateRoutes('Your Location', localMatch, mobilityProfile);
          } else {
            const bias = searchBias || userLocation;
            const results = await searchLocationsApi(intent.query, bias[0], bias[1]);
            if (results.length > 0) {
              await handleSelectSearchResult(results[0]);
            } else {
              const notFoundMsg = `I could not find ${intent.query}. Please try saying a street or landmark name.`;
              setVoiceMessage(notFoundMsg);
              voiceAssistant.speak(notFoundMsg);
            }
          }
        } catch (e) {
          const errMsg = `Search failed for ${intent.query}. Please try again.`;
          setVoiceMessage(errMsg);
          voiceAssistant.speak(errMsg);
        }
        break;
      }

      case 'CHANGE_PROFILE': {
        handleSelectProfile(intent.profile);
        const profMsg = `Switched to ${intent.profile} mode. Step-free preferences updated.`;
        setVoiceMessage(profMsg);
        voiceAssistant.speak(profMsg);
        break;
      }

      case 'PREFERENCE_AVOID_STAIRS': {
        const stairMsg = 'Avoiding all stairs and steep curbs in route calculations.';
        setVoiceMessage(stairMsg);
        voiceAssistant.speak(stairMsg);
        if (selectedPlace) {
          handleCalculateRoutes('Your Location', selectedPlace, mobilityProfile);
        }
        break;
      }

      case 'PREFERENCE_AVOID_SLOPES': {
        const slopeMsg = 'Prioritizing routes with gentle gradient below 5 percent.';
        setVoiceMessage(slopeMsg);
        voiceAssistant.speak(slopeMsg);
        if (selectedPlace) {
          handleCalculateRoutes('Your Location', selectedPlace, mobilityProfile);
        }
        break;
      }

      case 'PREFERENCE_PREFER_RAMPS': {
        const rampMsg = 'Prioritizing verified accessible ADA ramps along your route.';
        setVoiceMessage(rampMsg);
        voiceAssistant.speak(rampMsg);
        if (selectedPlace) {
          handleCalculateRoutes('Your Location', selectedPlace, mobilityProfile);
        }
        break;
      }

      case 'START_NAVIGATION':
        if (routes.length > 0) {
          handleStartNavigation();
        } else if (places.length > 0) {
          handleSelectPlace(places[0]);
        } else {
          const noRouteMsg = 'Please pick a destination first before starting navigation.';
          setVoiceMessage(noRouteMsg);
          voiceAssistant.speak(noRouteMsg);
        }
        break;

      case 'STOP_NAVIGATION':
        if (isNavigating) {
          handleExitNavigation();
          const stopMsg = 'Navigation stopped. Returned to map overview.';
          setVoiceMessage(stopMsg);
          voiceAssistant.speak(stopMsg);
        } else {
          const notNavMsg = 'Navigation is not currently active.';
          setVoiceMessage(notNavMsg);
          voiceAssistant.speak(notNavMsg);
        }
        break;

      case 'REPEAT_INSTRUCTION':
        voiceAssistant.repeatLast();
        break;

      case 'CURRENT_LOCATION': {
        const locMsg = `You are in ${selectedCity}. GPS accuracy is high with active tracking.`;
        setVoiceMessage(locMsg);
        voiceAssistant.speak(locMsg);
        break;
      }

      case 'NEXT_INSTRUCTION': {
        const activeR = routes.find((r) => r.id === selectedRouteId) || routes[0];
        if (isNavigating && activeR && activeR.steps[currentStepIndex]) {
          const step = activeR.steps[currentStepIndex];
          const stepMsg = `Next instruction: In ${step.distance_meters} meters, ${step.instruction} on ${step.street_name}.`;
          setVoiceMessage(stepMsg);
          voiceAssistant.speak(stepMsg);
        } else {
          const noManeuverMsg = 'No active turn instruction at the moment.';
          setVoiceMessage(noManeuverMsg);
          voiceAssistant.speak(noManeuverMsg);
        }
        break;
      }

      case 'REMAINING_TIME': {
        const mins = Math.ceil(remainingSeconds / 60);
        const timeMsg = `Approximately ${mins} minutes remaining to destination.`;
        setVoiceMessage(timeMsg);
        voiceAssistant.speak(timeMsg);
        break;
      }

      case 'REMAINING_DISTANCE': {
        const distMsg = `Remaining distance is ${remainingDistance} meters.`;
        setVoiceMessage(distMsg);
        voiceAssistant.speak(distMsg);
        break;
      }

      case 'REPORT_HAZARD': {
        const reportTitle = intent.details || 'Blocked accessibility path';
        const newReport = await submitReportApi({
          category: 'blocked_footpath',
          title: reportTitle,
          description: 'Spoken accessibility obstacle report submitted by user via Voice Assistant.',
          severity: 'moderate',
          lat: userLocation[0],
          lng: userLocation[1],
        });
        setReports((prev) => [newReport, ...prev]);
        const reportedMsg = 'Hazard reported at your current location. Thank you for contributing to safer accessible routes.';
        setVoiceMessage(reportedMsg);
        voiceAssistant.speak(reportedMsg);
        break;
      }

      case 'EMERGENCY': {
        const emergMsg = 'Emergency assistance requested. Safe hospital corridors highlighted.';
        setVoiceMessage(emergMsg);
        voiceAssistant.speak(emergMsg);
        triggerEmergencyMode();
        break;
      }

      case 'OPEN_SAVED_PLACES':
        setShowSavedPlacesModal(true);
        setVoiceMessage('Opening saved places.');
        voiceAssistant.speak('Opening saved places.');
        break;

      case 'OPEN_SETTINGS':
        setShowSettingsModal(true);
        setVoiceMessage('Opening settings and preferences.');
        voiceAssistant.speak('Opening settings and preferences.');
        break;

      case 'SPEAK_FASTER': {
        const fasterMsg = 'I will speak faster now.';
        setVoiceMessage(fasterMsg);
        voiceAssistant.speak(fasterMsg);
        break;
      }

      case 'ANOTHER_ROUTE': {
        if (routes.length > 1) {
          const currentIndex = routes.findIndex((r) => r.id === selectedRouteId);
          const nextIndex = (currentIndex + 1) % routes.length;
          const nextRoute = routes[nextIndex];
          setSelectedRouteId(nextRoute.id);
          const km = (nextRoute.distance_meters / 1000).toFixed(1);
          const altMsg = `Switched to alternative route. Takes ${nextRoute.duration_minutes} minutes, ${km} kilometres. Would you like to start navigation?`;
          setVoiceMessage(altMsg);
          voiceAssistant.speak(altMsg);
          pendingVoiceActionRef.current = { type: 'ROUTE_CONFIRM', route: nextRoute };
        } else if (selectedPlace) {
          handleCalculateRoutes('Your Location', selectedPlace, mobilityProfile);
          const calcMsg = 'Recalculating alternative accessible routes.';
          setVoiceMessage(calcMsg);
          voiceAssistant.speak(calcMsg);
        } else {
          const noAltMsg = 'No routes currently calculated. Please specify a destination first.';
          setVoiceMessage(noAltMsg);
          voiceAssistant.speak(noAltMsg);
        }
        break;
      }

      case 'UNKNOWN':
      default: {
        const raw = 'raw' in intent ? (intent as any).raw : '';
        const helpMsg = raw
          ? `I heard: ${raw}. You can say: Take me to a place, where am I, avoid stairs, or stop navigation.`
          : 'I am ready. Tell me where you would like to go.';
        setVoiceMessage(helpMsg);
        voiceAssistant.speak(helpMsg);
        break;
      }
    }
  };

  const triggerEmergencyMode = () => {
    if (events.length > 0 && events[0].polygon.length > 0) {
      const emergencyZone = events[0];
      setMapCenter([emergencyZone.polygon[0][0], emergencyZone.polygon[0][1]]);
      setMapZoom(16);
    }
  };

  // Select Place (From Local Dataset)
  const handleSelectPlace = (place: Place) => {
    setSelectedPlace(place);
    setSelectedReport(null);
    setShowDirectionsPanel(false);
    setMapCenter([place.latitude, place.longitude]);
    setShowSearchThisArea(false);
    handleCalculateRoutes('Your Location', place, mobilityProfile);
  };

  // Select Location from Geoapify Search Autocomplete
  const handleSelectSearchResult = async (result: SearchResult) => {
    setSelectedReport(null);
    setShowDirectionsPanel(false);
    setShowSearchThisArea(false);

    const destCoords: [number, number] = [result.latitude, result.longitude];
    setMapCenter(destCoords);
    setMapZoom(16);

    const accessData = await lookupAccessibilityApi(
      result.latitude,
      result.longitude,
      result.name
    );

    const newPlace: Place = {
      id: result.id || `search-${result.latitude}-${result.longitude}`,
      name: result.name,
      category: result.category || result.type || 'place',
      address: result.address || `${result.city || ''}, ${result.country || ''}`.trim() || result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      city: result.city || selectedCity,
      accessibility: accessData.has_data && accessData.accessibility
        ? accessData.accessibility
        : {
            has_accessible_entrance: false,
            has_ramp: false,
            has_elevator: false,
            has_tactile_paving: false,
            elevator_status: 'unknown',
            details: 'Accessibility information unavailable - Community verification needed',
          },
    };

    setSelectedPlace(newPlace);
    handleCalculateRoutes('Your Location', newPlace, mobilityProfile);
  };

  const lastPannedCenterRef = useRef<[number, number]>(mapCenter);

  const handleMapMoveEnd = (center: [number, number], _zoom: number) => {
    lastPannedCenterRef.current = center;
    const currentBias = searchBias || userLocation;
    if (currentBias) {
      const distKm = calculateDistanceKm(currentBias[0], currentBias[1], center[0], center[1]);
      if (distKm > 2.5) {
        setShowSearchThisArea(true);
      }
    }
  };

  const handleSearchThisArea = () => {
    const newBias = lastPannedCenterRef.current || mapCenter;
    setSearchBias(newBias);
    setShowSearchThisArea(false);
  };

  // Start Navigation Mode
  const handleStartNavigation = () => {
    const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
    if (!activeRoute) return;

    setIsNavigating(true);
    setCurrentStepIndex(0);
    setRemainingDistance(activeRoute.distance_meters);
    setRemainingSeconds(activeRoute.duration_seconds);
    setNavPosition(activeRoute.coordinates[0]);

    const startMsg = `Starting ${mobilityProfile} navigation to ${selectedPlace?.name || 'destination'}. Step-free route with ${activeRoute.accessibility_breakdown.ramps_count} verified ramps. Continue straight for ${activeRoute.steps[0]?.distance_meters || 100} meters.`;
    setVoiceMessage(startMsg);
    voiceAssistant.speak(startMsg);

    let pointIndex = 0;
    const totalPoints = activeRoute.coordinates.length;
    if (navIntervalRef.current) clearInterval(navIntervalRef.current);

    navIntervalRef.current = setInterval(() => {
      pointIndex++;
      if (pointIndex < totalPoints) {
        setNavPosition(activeRoute.coordinates[pointIndex]);
        const progress = pointIndex / totalPoints;
        setRemainingDistance(Math.round(activeRoute.distance_meters * (1 - progress)));
        setRemainingSeconds(Math.round(activeRoute.duration_seconds * (1 - progress)));

        if (pointIndex > totalPoints * 0.4 && currentStepIndex === 0) {
          setCurrentStepIndex(1);
          if (activeRoute.steps[1]) {
            const nextStepMsg = `In ${activeRoute.steps[1].distance_meters} meters, ${activeRoute.steps[1].instruction} on ${activeRoute.steps[1].street_name}.`;
            setVoiceMessage(nextStepMsg);
            voiceAssistant.speak(nextStepMsg);
          }
        }
      } else {
        clearInterval(navIntervalRef.current);
        const arrivalMsg = 'You have arrived safely at your destination.';
        setVoiceMessage(arrivalMsg);
        voiceAssistant.speak(arrivalMsg);
      }
    }, 2500);
  };

  const handleExitNavigation = () => {
    if (navIntervalRef.current) clearInterval(navIntervalRef.current);
    setIsNavigating(false);
    setNavPosition(null);
    voiceAssistant.speak('Navigation ended.');
  };

  // Obstacle Alert & Dynamic Detour
  const handleTriggerObstacleAlert = () => {
    setShowObstacleAlert(true);
    const alertMsg = 'Accessibility Alert: Obstacle reported ahead. Step-free detour recommended. Say yes to reroute.';
    setVoiceMessage(alertMsg);
    voiceAssistant.speak(alertMsg);
    pendingVoiceActionRef.current = { type: 'DETOUR_CONFIRM' };
  };

  const handleAcceptDetour = async () => {
    if (!selectedPlace) return;
    setShowObstacleAlert(false);
    try {
      const newRoute = await calculateRerouteApi(
        navPosition || userLocation,
        [selectedPlace.latitude, selectedPlace.longitude],
        mobilityProfile
      );
      setRoutes([newRoute]);
      setSelectedRouteId(newRoute.id);
      setCurrentStepIndex(0);
      setRemainingDistance(newRoute.distance_meters);
      setRemainingSeconds(newRoute.duration_seconds);
      const detourSuccessMsg = 'Detour accepted. Recalculated safe ramp corridor.';
      setVoiceMessage(detourSuccessMsg);
      voiceAssistant.speak(detourSuccessMsg);
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Community Report
  const handleSubmitReport = async (reportData: {
    category: ReportCategory;
    title: string;
    description: string;
    severity: 'low' | 'moderate' | 'severe' | 'critical';
    lat: number;
    lng: number;
  }) => {
    const created = await submitReportApi(reportData);
    setReports((prev) => [created, ...prev]);
    setShowReportModal(false);
    const msg = 'Hazard reported. Thank you for contributing to accessible navigation.';
    setVoiceMessage(msg);
    voiceAssistant.speak(msg);
  };

  // Vote on Community Report
  const handleVoteReport = async (reportId: string, voteType: 'upvote' | 'downvote' | 'resolve') => {
    try {
      const updated = await voteReportApi(reportId, voteType);
      setReports((prev) => prev.map((r) => (r.id === reportId ? updated : r)));
      setSelectedReport(updated);
    } catch {
      setReports((prev) =>
        prev.map((r) => {
          if (r.id === reportId) {
            return {
              ...r,
              upvotes: voteType === 'upvote' ? r.upvotes + 1 : r.upvotes,
              status: voteType === 'resolve' ? 'RESOLVED' : r.status,
            };
          }
          return r;
        })
      );
    }
  };

  // Handle Sidebar Navigation Clicks
  const handleSidebarNavigate = (section: SidebarSection) => {
    setActiveSidebarSection(section);
    switch (section) {
      case 'explore':
        if (userLocation) {
          setMapCenter(userLocation);
          setMapZoom(16);
        }
        break;
      case 'navigation':
        if (routes.length > 0) {
          handleStartNavigation();
        } else if (places.length > 0) {
          handleCalculateRoutes('Your Location', places[0], mobilityProfile);
        }
        break;
      case 'accessible-routes':
        if (places.length > 0) {
          if (!selectedPlace) setSelectedPlace(places[0]);
          setShowDirectionsPanel(true);
        }
        break;
      case 'profile':
        setShowProfileSelectorModal(true);
        break;
      case 'saved-places':
      case 'recent-trips':
        setShowSavedPlacesModal(true);
        break;
      case 'hazards':
      case 'reports':
        setLayers((prev) => ({ ...prev, showHazards: true }));
        if (reports.length > 0) {
          setSelectedReport(reports[0]);
          setMapCenter([reports[0].latitude, reports[0].longitude]);
          setMapZoom(16);
        }
        break;
      case 'report-issue':
        setShowReportModal(true);
        break;
      case 'map-layers':
        setLayers((prev) => ({ ...prev, showRamps: true, showTactile: true, showHazards: true }));
        break;
      case 'route-details':
        if (routes.length > 0) {
          setShowScreenReaderTable(true);
        }
        break;
      case 'voice':
        setIsVoiceAssistantActive(true);
        voiceAssistant.speak('Voice assistant activated. Where would you like to go?');
        voiceAssistant.startListening();
        break;
      case 'diagnostics':
        setShowDiagnostics((prev) => !prev);
        break;
      case 'settings':
      case 'help':
        setShowSettingsModal(true);
        break;
      case 'emergency':
        triggerEmergencyMode();
        break;
    }
  };

  // Voice Welcome Modal Handlers
  const handleAcceptVoiceWelcome = () => {
    setShowVoiceWelcome(false);
    setIsVoiceAssistantActive(true);
    voiceAssistant.unlockAudio();
    const welcomeMsg =
      "Voice-assisted navigation is now active. I'll help you find an accessible route. Would you like to use your current location, or search for a starting location?";
    setVoiceMessage(welcomeMsg);
    voiceAssistant.speak(welcomeMsg, {
      onComplete: () => {
        voiceAssistant.startListening();
      },
    });
  };

  const handleDeclineVoiceWelcome = () => {
    setShowVoiceWelcome(false);
    setIsVoiceAssistantActive(false);
    voiceAssistant.stopAll();
  };

  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0] || null;

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden ${
        layers.highContrast ? 'bg-black text-yellow-300' : 'bg-slate-900 text-slate-900'
      }`}
    >
      {/* 1. Error Banner Toast */}
      {bannerMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-fade-in pointer-events-auto">
          <div className="p-3.5 rounded-2xl bg-red-950/95 border border-red-700 text-white text-xs font-bold flex items-center justify-between gap-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{bannerMessage}</span>
            </div>
            <button
              onClick={() => setBannerMessage(null)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-red-300 hover:text-white hover:bg-red-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Voice-First Welcome Screen (1-Tap anywhere activation) */}
      {showVoiceWelcome && (
        <VoiceWelcomeModal
          onAcceptVoice={handleAcceptVoiceWelcome}
          onDeclineVoice={handleDeclineVoiceWelcome}
          highContrast={layers.highContrast}
        />
      )}

      {/* 3. Global Navigation Sidebar (Desktop persistent rail + Mobile off-canvas drawer) */}
      {!isNavigating && !showVoiceWelcome && (
        <GlobalSidebar
          activeSection={activeSidebarSection}
          onNavigate={handleSidebarNavigate}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isCollapsedDesktop={isDesktopSidebarCollapsed}
          onToggleCollapseDesktop={handleToggleCollapseDesktop}
          activeProfile={mobilityProfile}
          onOpenProfileSelector={() => setShowProfileSelectorModal(true)}
          onOpenReportModal={() => setShowReportModal(true)}
          onOpenPlanRoute={() => {
            if (!selectedPlace && places.length > 0) {
              setSelectedPlace(places[0]);
            }
            setShowDirectionsPanel(true);
          }}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenSavedPlaces={() => setShowSavedPlacesModal(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onToggleDiagnostics={() => setShowDiagnostics((prev) => !prev)}
          reports={reports}
          events={events}
          highContrast={layers.highContrast}
          isNavigating={isNavigating}
        />
      )}

      {/* Main Content Area */}
      <div
        className={`w-full h-full relative transition-all duration-200 ${
          !isNavigating && !showVoiceWelcome ? (isDesktopSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72 xl:lg:pl-76') : ''
        }`}
      >
        {/* 4. Top Header */}
        <AppHeader
          onToggleMenu={() => setIsMobileSidebarOpen((prev) => !prev)}
          selectedCity={selectedCity}
          onCityChange={handleCityChange}
          activeProfile={mobilityProfile}
          onOpenProfileSelector={() => setShowProfileSelectorModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          highContrast={layers.highContrast}
          isNavigating={isNavigating}
        />

        {/* 5. Interactive Leaflet Map Surface */}
        <MapView
          center={mapCenter}
          zoom={mapZoom}
          places={places}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => setSelectedRouteId(id)}
          reports={reports}
          selectedReport={selectedReport}
          onSelectReport={(r) => {
            setSelectedReport(r);
            setSelectedPlace(null);
          }}
          events={events}
          layers={layers}
          userLocation={userLocation}
          navigationActive={isNavigating}
          navPosition={navPosition}
          onMapClick={(lat, lng) => {
            console.log('Map clicked at', lat, lng);
          }}
          onMapMoveEnd={handleMapMoveEnd}
        />

        {/* 6. Top Hero Search Bar & Visible Profile Controls */}
        {!isNavigating && !showVoiceWelcome && (
          <FloatingSearchBar
            places={places}
            onSelectPlace={handleSelectPlace}
            onSelectSearchResult={handleSelectSearchResult}
            selectedCity={selectedCity}
            onCityChange={handleCityChange}
            onOpenReportModal={() => setShowReportModal(true)}
            onOpenDirections={() => {
              if (!selectedPlace && places.length > 0) {
                setSelectedPlace(places[0]);
              }
              setShowDirectionsPanel(true);
            }}
            activeProfile={mobilityProfile}
            onSelectProfile={handleSelectProfile}
            highContrast={layers.highContrast}
            onToggleHighContrast={() =>
              setLayers((prev) => ({ ...prev, highContrast: !prev.highContrast }))
            }
            userLocation={userLocation}
            searchBias={searchBias}
            showSearchThisArea={showSearchThisArea}
            onSearchThisArea={handleSearchThisArea}
          />
        )}

        {/* 7. Bottom Sheet & Panel Drawers */}
        {!isNavigating && !showVoiceWelcome && (
          <>
            {/* Route Results Bottom Sheet */}
            {routes.length > 0 && (
              <RouteResultsSheet
                routes={routes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={(id) => setSelectedRouteId(id)}
                onStartNavigation={handleStartNavigation}
                onClose={() => setRoutes([])}
                profile={mobilityProfile}
                destinationName={selectedPlace?.name || 'Destination'}
                highContrast={layers.highContrast}
              />
            )}

            {/* Place Details Card */}
            {selectedPlace && !showDirectionsPanel && routes.length === 0 && (
              <div className="absolute bottom-6 left-4 right-4 md:left-6 md:w-[410px] md:bottom-6 z-30 pointer-events-auto">
                <PlaceDetailsCard
                  place={selectedPlace}
                  onGetDirections={() => setShowDirectionsPanel(true)}
                  onClose={() => setSelectedPlace(null)}
                  highContrast={layers.highContrast}
                />
              </div>
            )}

            {/* Directions Panel with A -> B Inputs */}
            {showDirectionsPanel && routes.length === 0 && (
              <div className="absolute bottom-6 left-4 right-4 md:left-6 md:w-[410px] md:bottom-6 z-30 pointer-events-auto">
                <DirectionsPanel
                  originName="Your Location"
                  destination={selectedPlace || (places[0] || null)}
                  selectedProfile={mobilityProfile}
                  onSelectProfile={handleSelectProfile}
                  onCalculateRoutes={(origin, dest, prof, opts) => handleCalculateRoutes(origin, dest, prof, opts)}
                  onClose={() => setShowDirectionsPanel(false)}
                  isCalculating={isCalculatingRoutes}
                  highContrast={layers.highContrast}
                />
              </div>
            )}

            {/* Community Report Verification Drawer */}
            {selectedReport && (
              <div className="absolute bottom-6 left-4 right-4 md:left-6 md:w-[410px] md:bottom-6 z-30 pointer-events-auto">
                <VerificationDrawer
                  report={selectedReport}
                  onVote={handleVoteReport}
                  onClose={() => setSelectedReport(null)}
                  highContrast={layers.highContrast}
                />
              </div>
            )}
          </>
        )}

        {/* 8. Map Controls */}
        {!isNavigating && !showVoiceWelcome && (
          <MapControls
            layers={layers}
            onToggleLayer={(k) => setLayers((prev) => ({ ...prev, [k]: !prev[k] }))}
            onRecenter={() => {
              if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                    setUserLocation(coords);
                    setMapCenter(coords);
                    setMapZoom(16);
                    setSearchBias(coords);
                    setShowSearchThisArea(false);
                  },
                  () => {
                    setMapCenter(userLocation);
                    setMapZoom(16);
                  },
                  { enableHighAccuracy: true, timeout: 5000 }
                );
              } else {
                setMapCenter(userLocation);
                setMapZoom(16);
              }
            }}
            onOpenScreenReaderTable={() => {
              if (routes.length > 0) {
                setShowScreenReaderTable(true);
              } else if (places.length > 0) {
                handleCalculateRoutes('Your Location', places[0], mobilityProfile).then(() => {
                  setShowScreenReaderTable(true);
                });
              }
            }}
            highContrast={layers.highContrast}
            isNavigating={isNavigating}
          />
        )}

        {/* 9. Floating Purple Voice Assistant Trigger Button (Map Overlay) */}
        {!isNavigating && !showVoiceWelcome && !isVoiceAssistantActive && (
          <div className="fixed bottom-6 right-4 sm:bottom-8 sm:right-6 z-30 pointer-events-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-bold border border-purple-500/40 shadow-lg card-shadow-md">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 mr-1.5" />
              <span>Voice Assistant</span>
            </div>
            <VoiceOrb
              state={voiceState}
              onClick={() => {
                setIsVoiceAssistantActive(true);
                voiceAssistant.unlockAudio();
                voiceAssistant.startListening();
              }}
              size="md"
              highContrast={layers.highContrast}
            />
          </div>
        )}
      </div>

      {/* 10. Voice Assistant Live HUD Overlay (Active Mode) */}
      {isVoiceAssistantActive && !showVoiceWelcome && (
        <VoiceAssistantHUD
          voiceState={voiceState}
          currentMessage={voiceMessage}
          transcript={voiceTranscript}
          isListening={voiceIsListening}
          isMuted={voiceIsMuted}
          onToggleListening={() => voiceAssistant.toggleListening()}
          onToggleMute={() => setVoiceIsMuted(voiceAssistant.toggleMute())}
          onRepeat={() => voiceAssistant.repeatLast()}
          onTypeInstead={() => {
            if (!selectedPlace && places.length > 0) {
              setSelectedPlace(places[0]);
            }
            setShowDirectionsPanel(true);
          }}
          onExitVoiceMode={() => {
            voiceAssistant.stopListening();
            setIsVoiceAssistantActive(false);
            try {
              localStorage.setItem('accessroute_voice_first_mode', 'false');
            } catch {}
          }}
          highContrast={layers.highContrast}
        />
      )}

      {/* 11. Command Search Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSelectProfile={handleSelectProfile}
        onSelectPlace={handleSelectPlace}
        onOpenReportModal={() => setShowReportModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenScreenReaderTable={() => {
          if (routes.length > 0) {
            setShowScreenReaderTable(true);
          } else if (places.length > 0) {
            handleCalculateRoutes('Your Location', places[0], mobilityProfile).then(() => {
              setShowScreenReaderTable(true);
            });
          }
        }}
        places={places}
        highContrast={layers.highContrast}
      />

      {/* 12. Saved Places Modal */}
      {showSavedPlacesModal && (
        <SavedPlacesModal
          onClose={() => setShowSavedPlacesModal(false)}
          onSelectPlace={handleSelectPlace}
          places={places}
          highContrast={layers.highContrast}
        />
      )}

      {/* 13. Mobility Profile Selector Modal */}
      {showProfileSelectorModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl">
            <MobilityProfileSelector
              selectedProfile={mobilityProfile}
              onSelectProfile={(p) => {
                handleSelectProfile(p);
                setShowProfileSelectorModal(false);
              }}
              onClose={() => setShowProfileSelectorModal(false)}
              highContrast={layers.highContrast}
            />
          </div>
        </div>
      )}

      {/* 14. Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          highContrast={layers.highContrast}
          onToggleHighContrast={() =>
            setLayers((prev) => ({ ...prev, highContrast: !prev.highContrast }))
          }
          activeProfile={mobilityProfile}
          onSelectProfile={handleSelectProfile}
        />
      )}

      {/* 15. Developer Routing Diagnostics Panel */}
      <DeveloperDebugPanel
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        activeRoute={activeRoute}
        userLocation={userLocation}
        destination={selectedPlace ? [selectedPlace.latitude, selectedPlace.longitude] : null}
        profile={mobilityProfile}
        voiceState={voiceState}
        isListening={voiceIsListening}
        isVoiceSupported={voiceAssistant.isVoiceRecognitionSupported()}
        voiceName=""
        highContrast={layers.highContrast}
      />

      {/* 16. Full-Screen Turn-by-Turn Navigation HUD */}
      {isNavigating && activeRoute && (
        <NavigationHUD
          route={activeRoute}
          currentStepIndex={currentStepIndex}
          remainingDistance={remainingDistance}
          remainingSeconds={remainingSeconds}
          onExitNavigation={handleExitNavigation}
          onTriggerObstacleAlert={handleTriggerObstacleAlert}
          onOpenReportModal={() => setShowReportModal(true)}
          highContrast={layers.highContrast}
        />
      )}

      {/* 17. Obstacle Detour Modal */}
      {showObstacleAlert && (
        <ObstacleAlertModal
          obstacleTitle="Obstacle reported on path ahead"
          detourTimeEstimate="+3 min (100% step-free)"
          onAcceptDetour={handleAcceptDetour}
          onDismiss={() => setShowObstacleAlert(false)}
          highContrast={layers.highContrast}
        />
      )}

      {/* 18. Community Hazard Report Modal */}
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleSubmitReport}
          defaultLocation={userLocation}
          highContrast={layers.highContrast}
        />
      )}

      {/* 19. Screen Reader Table View */}
      {showScreenReaderTable && activeRoute && (
        <ScreenReaderTable
          route={activeRoute}
          profile={mobilityProfile}
          onClose={() => setShowScreenReaderTable(false)}
          highContrast={layers.highContrast}
        />
      )}
    </div>
  );
};

export default App;
