"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Square,
  MapPin,
  Car,
  Settings,
  Activity,
  Navigation,
  Save,
  LogOut,
  User,
  Shield,
  Bell,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import {
  useWebSocket,
  type NotificationMessage,
  type SimulationStateMessage,
} from "../hooks/use-websocket";
import NotificationPopup from "./components/notification-popup";
import AdminNotificationPanel from "./components/admin-notification-panel";

// Dynamic import to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import("./components/map-component"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center">
      Loading Map...
    </div>
  ),
});

export interface Waypoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  vehicle?: Vehicle | null;
}

export interface PathPoint {
  lat: number;
  lng: number;
  isWaypoint?: boolean;
  waypointId?: number;
}

export interface Vehicle {
  id: number;
  licensePlate: string;
  model: string;
  brand: string;
  type: string;
  currentWaypoint?: number;
  targetWaypoint?: number;
  speed: number;
  initialDelay: number;
  status: "idle" | "moving" | "stopped";
  simulationData?: SimulationData;
  plannedPath?: PathPoint[];
}

export interface SimulationData {
  avgSpeed: number;
  latitude: number;
  longitude: number;
  heading: number;
  status: string;
  timestamp: string;
  fuelLevel: number;
  engineStatus: boolean;
  distanceTravelled: number;
  startTime?: number;
  currentLat?: number;
  currentLng?: number;
  targetLat?: number;
  targetLng?: number;
  progress?: number;
  pathIndex?: number;
  delayStartTime?: number;
  isDelayed?: boolean;
}

// Add interface for VehicleResponseDto
interface VehicleResponseDto {
  vehicleDto: {
    id: number;
    licensePlate: string;
    model: string;
    brand: string;
    type: string;
    speed: number;
    Status: string;
  };
  message: string;
}

// Backend DTOs
interface WayPointDto {
  latitude: number;
  longitude: number;
}

interface VehicleInfoDto {
  vehicle_id: number;
  speed: number;
  initialDelay: number;
}

interface SimulationRequest {
  wp: WayPointDto[];
  vi: VehicleInfoDto[];
}

// Add interface for saved simulation
interface SavedSimulation {
  simulationId?: number;
  vehicles: VehicleInfoDto[];
  waypoints: WayPointDto[];
  createdAt?: string;
}

interface SimulationDetailsResponseDto {
  simulationId?: number;
  vehicles: VehicleInfoDto[];
  waypoints: WayPointDto[];
}

// Add interface for simulation record
interface SimulationRecord {
  simulationId: number;
  name: string;
  vehicles: VehicleInfoDto[];
  waypoints: WayPointDto[];
}

interface AllSimulationDetailsResponseDto {
  simulationId: number;
  vehicles: VehicleInfoDto[];
  waypoints: WayPointDto[];
}

export default function VehicleSimulator() {
  // ===== VEHICLE SIMULATION BROADCASTING FIX =====
  // Key changes implemented to fix real-time position updates:
  // 1. Consolidated broadcasting into main simulation loop (removed duplicate intervals)
  // 2. Added optimized LIVE_POSITION_UPDATE message type for high-frequency updates
  // 3. Enhanced user-side handler to properly merge position data
  // 4. Added comprehensive logging for debugging
  // 5. Maintained backward compatibility with legacy message types

  // All useState hooks first (keep existing ones)
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [vehicleIdInput, setVehicleIdInput] = useState("");
  const [selectedVehicleSpeed, setSelectedVehicleSpeed] = useState(50);
  const [selectedInitialDelay, setSelectedInitialDelay] = useState(0);
  const [simulationStats, setSimulationStats] = useState({
    totalVehicles: 0,
    activeVehicles: 0,
    completedJourneys: 0,
  });
  const [selectedSourceWaypoint, setSelectedSourceWaypoint] = useState<
    number | null
  >(null);
  const [selectedDestinationWaypoint, setSelectedDestinationWaypoint] =
    useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState<"source" | "destination">(
    "source"
  );
  const [waypointsSent, setWaypointsSent] = useState(false);
  const [savedSimulations, setSavedSimulations] = useState<SavedSimulation[]>(
    []
  );
  const [showSimulationsList, setShowSimulationsList] = useState(false);
  const [isLoadingSimulations, setIsLoadingSimulations] = useState(false);
  const [simulationRecords, setSimulationRecords] = useState<
    SimulationRecord[]
  >([]);
  const [showRecordsList, setShowRecordsList] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x speed by default
  const [isPaused, setIsPaused] = useState(false);

  // Authentication state
  const [userType, setUserType] = useState<"admin" | "user" | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);

  // Add state for tracking if this is a received simulation (for users)
  const [isReceivingSimulation, setIsReceivingSimulation] = useState(false);

  const simulationInterval = useRef<NodeJS.Timeout | null>(null);
  const liveLocationInterval = useRef<NodeJS.Timeout | null>(null); // NEW: For live location updates
  const router = useRouter();

  // API Base URL
  const API_BASE_URL = "http://localhost:8082";
  const API_BASE_URL_1 = "http://localhost:8081";

  const WEBSOCKET_URL = "ws://localhost:8083/ws/websocket";

  // WebSocket connection with simulation updates - REMOVED broadcastLiveLocationUpdate from destructuring
  const {
    isConnected: wsConnected,
    sendNotification,
    broadcastSimulationUpdate,
  } = useWebSocket({
    url: WEBSOCKET_URL,
    onNotification: (message) => {
      console.log("Received notification:", message);
      setNotifications((prev) => [...prev, message]);

      // Show toast notification
      toast({
        title: message.title,
        description: message.content,
        variant: message.type === "ERROR" ? "destructive" : "default",
      });
    },
    onSimulationUpdate: (message) => {
      console.log("Received simulation update:", message);
      handleSimulationUpdate(message);
    },
    enabled: isLoggedIn,
  });

  // ===== LEGACY FUNCTION - NOW UNUSED =====
  // This function is kept for reference but no longer actively used in the simulation
  // Position broadcasting is now handled directly in the main simulation loop for better performance
  const broadcastLiveLocationUpdate = (vehicles: Vehicle[]) => {
    if (wsConnected && userType === "admin") {
      try {
        // Filter only moving vehicles for live updates to reduce payload
        const movingVehicles = vehicles.filter(
          (v) =>
            v.status === "moving" &&
            v.simulationData?.currentLat &&
            v.simulationData?.currentLng
        );

        if (movingVehicles.length === 0) {
          return; // No moving vehicles to broadcast
        }

        const locationUpdate = {
          type: "LIVE_LOCATION_UPDATE",
          data: {
            vehicles: movingVehicles.map((vehicle) => ({
              id: vehicle.id,
              licensePlate: vehicle.licensePlate,
              status: vehicle.status,
              currentLat: vehicle.simulationData?.currentLat,
              currentLng: vehicle.simulationData?.currentLng,
              heading: vehicle.simulationData?.heading || 0,
              progress: vehicle.simulationData?.progress || 0,
              speed: vehicle.speed,
              distanceTravelled: vehicle.simulationData?.distanceTravelled || 0,
              // Include full simulation data for complete state sync
              simulationData: {
                ...vehicle.simulationData,
                currentLat: vehicle.simulationData?.currentLat,
                currentLng: vehicle.simulationData?.currentLng,
                heading: vehicle.simulationData?.heading || 0,
                progress: vehicle.simulationData?.progress || 0,
                status: vehicle.simulationData?.status || vehicle.status,
                timestamp: new Date().toISOString(),
              },
              // Include path information for users who just joined
              plannedPath: vehicle.plannedPath,
              currentWaypoint: vehicle.currentWaypoint,
              targetWaypoint: vehicle.targetWaypoint,
            })),
            timestamp: Date.now(),
            playbackSpeed: playbackSpeed,
          },
          timestamp: Date.now(),
        };

        console.log(
          "Broadcasting live location update for",
          movingVehicles.length,
          "moving vehicles:",
          movingVehicles.map(
            (v) =>
              `${v.licensePlate}: ${v.simulationData?.currentLat?.toFixed(
                4
              )}, ${v.simulationData?.currentLng?.toFixed(4)}`
          )
        );

        // Use broadcastSimulationUpdate to send the live location update
        broadcastSimulationUpdate({
          type: "LIVE_LOCATION_UPDATE",
          data: locationUpdate.data,
          timestamp: locationUpdate.timestamp,
        });

        console.log("Live location update broadcast successfully");
      } catch (error) {
        console.error("Error broadcasting live location update:", error);
      }
    }
  };

  // Handle incoming simulation updates
  const handleSimulationUpdate = (message: SimulationStateMessage) => {
    console.log("Processing simulation update:", message.type, message.data);

    // 🐛 DEBUG: Log WebSocket message reception details
    console.log(`🌐 WebSocket message received:`, {
      type: message.type,
      timestamp: message.timestamp,
      userType: userType,
      isReceivingSimulation: isReceivingSimulation,
      wsConnected: wsConnected,
      hasData: !!message.data,
      vehicleCount: message.data?.vehicles?.length || 0,
    });

    switch (message.type) {
      case "SIMULATION_STARTED":
        if (userType === "user") {
          console.log(
            "User receiving simulation start with vehicles:",
            message.data.vehicles
          );
          setIsReceivingSimulation(true);
          setIsSimulationRunning(true);
          setIsPaused(false);
          setVehicles(message.data.vehicles || []);
          setPlaybackSpeed(message.data.playbackSpeed || 1);

          toast({
            title: "Simulation Started",
            description:
              "Admin has started a simulation. You can now view it live!",
          });
        }
        break;

      case "SIMULATION_STOPPED":
        if (userType === "user") {
          setIsReceivingSimulation(false);
          setIsSimulationRunning(false);
          setIsPaused(false);
          // Reset vehicles to idle state
          setVehicles((prev) =>
            prev.map((v) => ({ ...v, status: "idle" as const }))
          );

          toast({
            title: "Simulation Stopped",
            description: "The simulation has been stopped by admin",
          });
        }
        break;

      case "SIMULATION_PAUSED":
        if (userType === "user") {
          setIsPaused(true);
          toast({
            title: "Simulation Paused",
            description: "The simulation has been paused by admin",
          });
        }
        break;

      case "SIMULATION_RESUMED":
        if (userType === "user") {
          setIsPaused(false);
          toast({
            title: "Simulation Resumed",
            description: "The simulation has been resumed by admin",
          });
        }
        break;

      case "VEHICLE_UPDATE":
        if (userType === "user" && isReceivingSimulation) {
          console.log("User receiving vehicle update:", message.data.vehicles);
          // Update vehicle positions in real-time
          setVehicles(message.data.vehicles || []);
          setSimulationStats(
            message.data.stats || {
              totalVehicles: 0,
              activeVehicles: 0,
              completedJourneys: 0,
            }
          );
        }
        break;

      case "LIVE_POSITION_UPDATE": // NEW: Optimized handler for real-time position updates
        if (userType === "user" && isReceivingSimulation) {
          console.log(
            `📡 USER: Receiving live position update for ${
              message.data.vehicles?.length || 0
            } vehicles`
          );

          // 🐛 DEBUG: Log the received message details
          console.log(`🔍 USER: Message details:`, {
            type: message.type,
            userType: userType,
            isReceivingSimulation: isReceivingSimulation,
            vehicleData: message.data.vehicles?.map((v) => ({
              id: v.id,
              licensePlate: v.licensePlate,
              currentLat: v.currentLat,
              currentLng: v.currentLng,
              status: v.status,
            })),
          });

          // 🔧 CRITICAL FIX: Handle both merging with existing vehicles and creating new ones if needed
          setVehicles((prevVehicles) => {
            console.log(
              `🔍 USER: Current vehicles in state:`,
              prevVehicles.map((v) => ({
                id: v.id,
                licensePlate: v.licensePlate,
                currentLat: v.simulationData?.currentLat,
                currentLng: v.simulationData?.currentLng,
              }))
            );

            // Create a map of existing vehicles by ID for faster lookup
            const existingVehiclesMap = new Map();
            prevVehicles.forEach((vehicle) => {
              existingVehiclesMap.set(vehicle.id, vehicle);
            });

            // Process position updates and create updated vehicle array
            const updatedVehicles =
              message.data.vehicles?.map((positionUpdate: any) => {
                const existingVehicle = existingVehiclesMap.get(
                  positionUpdate.id
                );

                if (
                  existingVehicle &&
                  positionUpdate.currentLat &&
                  positionUpdate.currentLng
                ) {
                  console.log(
                    `🎯 USER: Updating ${positionUpdate.licensePlate} position: ` +
                      `${positionUpdate.currentLat.toFixed(
                        4
                      )}, ${positionUpdate.currentLng.toFixed(4)} ` +
                      `(${Math.round(
                        (positionUpdate.progress || 0) * 100
                      )}% complete)`
                  );

                  // 🐛 DEBUG: Log before and after state for this vehicle
                  console.log(
                    `🔄 USER: Vehicle ${positionUpdate.licensePlate} state change:`,
                    {
                      before: {
                        currentLat:
                          existingVehicle.simulationData?.currentLat?.toFixed(
                            6
                          ),
                        currentLng:
                          existingVehicle.simulationData?.currentLng?.toFixed(
                            6
                          ),
                        status: existingVehicle.status,
                      },
                      after: {
                        currentLat: positionUpdate.currentLat.toFixed(6),
                        currentLng: positionUpdate.currentLng.toFixed(6),
                        status: positionUpdate.status,
                      },
                    }
                  );

                  // Merge the position update with existing vehicle data
                  return {
                    ...existingVehicle,
                    status: positionUpdate.status, // Update movement status
                    simulationData: {
                      ...existingVehicle.simulationData, // Keep existing simulation data
                      // Update critical position and movement data
                      currentLat: positionUpdate.currentLat,
                      currentLng: positionUpdate.currentLng,
                      heading:
                        positionUpdate.heading ||
                        existingVehicle.simulationData?.heading ||
                        0,
                      progress:
                        positionUpdate.progress ||
                        existingVehicle.simulationData?.progress ||
                        0,
                      distanceTravelled:
                        positionUpdate.distanceTravelled ||
                        existingVehicle.simulationData?.distanceTravelled ||
                        0,
                      timestamp: new Date(
                        positionUpdate.timestamp || Date.now()
                      ).toISOString(),
                      status:
                        positionUpdate.status ||
                        existingVehicle.simulationData?.status ||
                        "moving",
                      // Keep other simulation data
                      avgSpeed:
                        existingVehicle.simulationData?.avgSpeed ||
                        positionUpdate.speed ||
                        50,
                      latitude: positionUpdate.currentLat, // For compatibility
                      longitude: positionUpdate.currentLng, // For compatibility
                      fuelLevel:
                        existingVehicle.simulationData?.fuelLevel || 75,
                      engineStatus:
                        existingVehicle.simulationData?.engineStatus || true,
                    },
                    // Preserve route and waypoint information
                    plannedPath: existingVehicle.plannedPath,
                    currentWaypoint: existingVehicle.currentWaypoint,
                    targetWaypoint: existingVehicle.targetWaypoint,
                    // Ensure other vehicle properties are preserved
                    licensePlate:
                      positionUpdate.licensePlate ||
                      existingVehicle.licensePlate,
                    model: existingVehicle.model,
                    brand: existingVehicle.brand,
                    type: existingVehicle.type,
                    speed: existingVehicle.speed,
                    initialDelay: existingVehicle.initialDelay,
                  };
                } else if (
                  positionUpdate.currentLat &&
                  positionUpdate.currentLng
                ) {
                  // 🆕 CREATE NEW VEHICLE: If vehicle doesn't exist in user state, create it
                  console.log(
                    `🆕 USER: Creating new vehicle from position update: ${positionUpdate.licensePlate}`
                  );

                  return {
                    id: positionUpdate.id,
                    licensePlate:
                      positionUpdate.licensePlate ||
                      `Vehicle-${positionUpdate.id}`,
                    model: "Unknown Model",
                    brand: "Unknown Brand",
                    type: "Unknown Type",
                    speed: 50,
                    initialDelay: 0,
                    status: positionUpdate.status || "moving",
                    currentWaypoint: undefined,
                    targetWaypoint: undefined,
                    plannedPath: [],
                    simulationData: {
                      avgSpeed: 50,
                      latitude: positionUpdate.currentLat,
                      longitude: positionUpdate.currentLng,
                      currentLat: positionUpdate.currentLat,
                      currentLng: positionUpdate.currentLng,
                      heading: positionUpdate.heading || 0,
                      status: positionUpdate.status || "moving",
                      timestamp: new Date(
                        positionUpdate.timestamp || Date.now()
                      ).toISOString(),
                      fuelLevel: 75,
                      engineStatus: true,
                      distanceTravelled: positionUpdate.distanceTravelled || 0,
                      progress: positionUpdate.progress || 0,
                    },
                  };
                } else {
                  console.log(
                    `⚠️ USER: Invalid position update for vehicle ${positionUpdate.id}`
                  );
                  return existingVehicle; // Return existing vehicle unchanged
                }
              }) || [];

            // Filter out any undefined vehicles and ensure we have valid data
            const validUpdatedVehicles = updatedVehicles.filter(
              (v) => v && v.id
            );

            console.log(
              `✅ USER: Updated ${validUpdatedVehicles.length} vehicles with new positions`
            );
            return validUpdatedVehicles;
          });

          // Update simulation statistics on the user side for dashboard consistency
          if (message.data.stats) {
            setSimulationStats(message.data.stats);
          }

          // 🐛 DEBUG: Log completion of user-side position update
          console.log(`✅ USER: Position update processing complete`);
        } else {
          // 🐛 DEBUG: Log why the position update was skipped
          console.log(`❌ USER: Position update skipped:`, {
            userType: userType,
            isReceivingSimulation: isReceivingSimulation,
            messageType: message.type,
          });
        }
        break;

      case "LIVE_LOCATION_UPDATE": // LEGACY: Keep for backward compatibility but prefer LIVE_POSITION_UPDATE
        if (userType === "user" && isReceivingSimulation) {
          console.log(
            "⚠️ User receiving legacy live location update for",
            message.data.vehicles?.length || 0,
            "vehicles (consider upgrading to LIVE_POSITION_UPDATE)"
          );

          // Update only the live coordinates and simulation data while preserving other vehicle data
          setVehicles((prevVehicles) => {
            return prevVehicles.map((prevVehicle) => {
              const updatedVehicle = message.data.vehicles?.find(
                (v: any) => v.id === prevVehicle.id
              );
              if (
                updatedVehicle &&
                updatedVehicle.currentLat &&
                updatedVehicle.currentLng
              ) {
                console.log(
                  `Updating vehicle ${prevVehicle.licensePlate} position to: ${updatedVehicle.currentLat}, ${updatedVehicle.currentLng}`
                );
                return {
                  ...prevVehicle,
                  status: updatedVehicle.status || prevVehicle.status,
                  simulationData: {
                    ...prevVehicle.simulationData,
                    ...updatedVehicle.simulationData,
                    currentLat: updatedVehicle.currentLat,
                    currentLng: updatedVehicle.currentLng,
                    heading:
                      updatedVehicle.heading ||
                      prevVehicle.simulationData?.heading ||
                      0,
                    progress:
                      updatedVehicle.progress ||
                      prevVehicle.simulationData?.progress ||
                      0,
                    distanceTravelled:
                      updatedVehicle.distanceTravelled ||
                      prevVehicle.simulationData?.distanceTravelled ||
                      0,
                    status:
                      updatedVehicle.simulationData?.status ||
                      updatedVehicle.status ||
                      prevVehicle.status,
                    timestamp:
                      updatedVehicle.simulationData?.timestamp ||
                      new Date().toISOString(),
                  },
                  // Update path and waypoint info if provided
                  plannedPath:
                    updatedVehicle.plannedPath || prevVehicle.plannedPath,
                  currentWaypoint:
                    updatedVehicle.currentWaypoint ||
                    prevVehicle.currentWaypoint,
                  targetWaypoint:
                    updatedVehicle.targetWaypoint || prevVehicle.targetWaypoint,
                };
              }
              return prevVehicle;
            });
          });
        }
        break;

      case "SIMULATION_STATE":
        if (userType === "user" && message.data.isRunning) {
          // Sync with ongoing simulation
          console.log("🔄 User syncing with ongoing simulation:", {
            vehicleCount: message.data.vehicles?.length || 0,
            isRunning: message.data.isRunning,
            isPaused: message.data.isPaused,
          });

          setIsReceivingSimulation(true);
          setIsSimulationRunning(message.data.isRunning);
          setIsPaused(message.data.isPaused || false);
          setVehicles(message.data.vehicles || []);
          setPlaybackSpeed(message.data.playbackSpeed || 1);
          setSimulationStats(
            message.data.stats || {
              totalVehicles: 0,
              activeVehicles: 0,
              completedJourneys: 0,
            }
          );

          console.log(
            "✅ User successfully synced - ready to receive LIVE_POSITION_UPDATE messages"
          );

          toast({
            title: "Simulation Synced",
            description: "Connected to ongoing simulation",
          });
        }
        break;
    }
  };

  // Islamabad waypoints
  const ISLAMABAD_WAYPOINTS: Waypoint[] = [
    { id: 1, name: "Faisal Mosque", lat: 33.7294, lng: 73.0367 },
    { id: 2, name: "Pakistan Monument", lat: 33.6938, lng: 73.0651 },
    { id: 3, name: "Daman-e-Koh", lat: 33.7394, lng: 73.055 },
    { id: 4, name: "Lok Virsa Museum", lat: 33.6844, lng: 73.0479 },
    { id: 5, name: "Rawal Lake", lat: 33.7167, lng: 73.1333 },
    { id: 6, name: "Centaurus Mall", lat: 33.7081, lng: 73.0434 },
    { id: 7, name: "Blue Area", lat: 33.7077, lng: 73.0563 },
    { id: 8, name: "F-9 Park", lat: 33.6969, lng: 73.0215 },
    { id: 9, name: "Margalla Hills", lat: 33.7681, lng: 73.0339 },
    { id: 10, name: "Islamabad Airport", lat: 33.6149, lng: 73.0993 },
    { id: 11, name: "Shakarparian", lat: 33.6844, lng: 73.0479 },
    { id: 12, name: "Rose & Jasmine Garden", lat: 33.6844, lng: 73.0279 },
  ];

  // Send waypoints to backend
  const sendWaypointsToBackend = async (waypoints: Waypoint[]) => {
    try {
      const waypointDtos: WayPointDto[] = waypoints.map((wp) => ({
        latitude: wp.lat,
        longitude: wp.lng,
      }));

      const response = await fetch(`${API_BASE_URL}/api/simulation/waypoints`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(waypointDtos),
      });

      if (response.ok) {
        const result = await response.text();
        console.log("Waypoints saved:", result);
        setWaypointsSent(true);
        toast({
          title: "Waypoints Saved",
          description: `${waypoints.length} waypoints saved to backend`,
        });
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error sending waypoints:", error);
      toast({
        title: "Error",
        description: `Failed to save waypoints: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    }
  };

  // Save simulation to backend
  const saveSimulation = async () => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can save simulations",
        variant: "destructive",
      });
      return;
    }

    if (vehicles.length === 0) {
      toast({
        title: "Error",
        description: "No vehicles to save in simulation",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get unique waypoints used in the simulation
      const usedWaypointIds = new Set<number>();
      vehicles.forEach((vehicle) => {
        if (vehicle.currentWaypoint)
          usedWaypointIds.add(vehicle.currentWaypoint);
        if (vehicle.targetWaypoint) usedWaypointIds.add(vehicle.targetWaypoint);
        // Add intermediate waypoints from planned path
        vehicle.plannedPath?.forEach((point) => {
          if (point.isWaypoint && point.waypointId) {
            usedWaypointIds.add(point.waypointId);
          }
        });
      });

      const usedWaypoints = waypoints.filter((wp) =>
        usedWaypointIds.has(wp.id)
      );

      const simulationRequest: SimulationRequest = {
        wp: usedWaypoints.map((wp) => ({
          latitude: wp.lat,
          longitude: wp.lng,
        })),
        vi: vehicles.map((vehicle) => ({
          vehicle_id: vehicle.id,
          speed: vehicle.speed,
          initialDelay: vehicle.initialDelay,
        })),
      };

      const response = await fetch(`${API_BASE_URL}/api/simulation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(simulationRequest),
      });

      if (response.ok) {
        const result = await response.text();
        console.log("Simulation saved:", result);
        toast({
          title: "Simulation Saved",
          description: `Simulation with ${vehicles.length} vehicles and ${usedWaypoints.length} waypoints saved successfully`,
        });
      } else {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }
    } catch (error) {
      console.error("Error saving simulation:", error);
      toast({
        title: "Error",
        description: `Failed to save simulation: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    }
  };

  // Fetch all simulation records
  const fetchSimulationRecords = async () => {
    setIsLoadingRecords(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/simulation/all`);

      if (response.ok) {
        const records: AllSimulationDetailsResponseDto[] =
          await response.json();
        setSimulationRecords(
          records.map((record) => ({
            simulationId: record.simulationId,
            name: `simulation_record_${record.simulationId}`,
            vehicles: record.vehicles,
            waypoints: record.waypoints,
          }))
        );
        setShowRecordsList(true);
        toast({
          title: "Records Loaded",
          description: `Found ${records.length} simulation records`,
        });
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching simulation records:", error);
      toast({
        title: "Error",
        description: `Failed to fetch simulation records: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingRecords(false);
    }
  };

  // Load a specific simulation record
  const loadSimulationRecord = async (record: SimulationRecord) => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can load simulation records",
        variant: "destructive",
      });
      return;
    }

    try {
      // Clear current vehicles and reset state but keep simulation stopped
      setVehicles([]);
      setIsSimulationRunning(false);
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
      if (liveLocationInterval.current) {
        clearInterval(liveLocationInterval.current);
      }
      resetSelection();

      // Find matching waypoints from our predefined list
      const matchedWaypoints: Waypoint[] = [];
      record.waypoints.forEach((recordWp) => {
        const matchedWaypoint = ISLAMABAD_WAYPOINTS.find(
          (wp) =>
            Math.abs(wp.lat - recordWp.latitude) < 0.001 &&
            Math.abs(wp.lng - recordWp.longitude) < 0.001
        );
        if (matchedWaypoint) {
          matchedWaypoints.push(matchedWaypoint);
        }
      });

      // Load vehicles from simulation record
      const loadedVehicles: Vehicle[] = [];
      for (const vehicleInfo of record.vehicles) {
        const vehicle = await fetchVehicle(vehicleInfo.vehicle_id);
        if (vehicle) {
          // For loaded records, place vehicles at the first waypoint and set target to the second waypoint
          const sourceWaypoint = matchedWaypoints[0];
          const targetWaypoint = matchedWaypoints[1] || matchedWaypoints[0];

          if (sourceWaypoint) {
            const plannedPath =
              targetWaypoint && targetWaypoint.id !== sourceWaypoint.id
                ? calculateOptimalPath(sourceWaypoint, targetWaypoint)
                : [
                    {
                      lat: sourceWaypoint.lat,
                      lng: sourceWaypoint.lng,
                      isWaypoint: true,
                      waypointId: sourceWaypoint.id,
                    },
                  ];

            const vehicleWithPath: Vehicle = {
              id: vehicleInfo.vehicle_id, // Use the original vehicle_id from simulation record
              licensePlate: vehicle.licensePlate,
              model: vehicle.model,
              brand: vehicle.brand,
              type: vehicle.type,
              currentWaypoint: sourceWaypoint.id,
              targetWaypoint: targetWaypoint.id,
              speed: Number(vehicleInfo.speed),
              initialDelay: Number(vehicleInfo.initialDelay),
              plannedPath: plannedPath,
              status: "idle", // Keep vehicles in idle state for editing
            };
            loadedVehicles.push(vehicleWithPath);
          }
        }
      }

      // Update waypoints to show vehicles
      setWaypoints((prev) =>
        prev.map((wp) => {
          const vehicleAtWaypoint = loadedVehicles.find(
            (v) => v.currentWaypoint === wp.id
          );
          return vehicleAtWaypoint ? { ...wp, vehicle: vehicleAtWaypoint } : wp;
        })
      );

      setVehicles(loadedVehicles);
      setShowRecordsList(false);

      toast({
        title: "Simulation Record Loaded",
        description: `Loaded ${record.name} with ${loadedVehicles.length} vehicles. Ready to edit or run.`,
      });
    } catch (error) {
      console.error("Error loading simulation record:", error);
      toast({
        title: "Error",
        description: `Failed to load simulation record: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
    }
  };

  // Offline path calculation using A* algorithm (simplified)
  const calculateOptimalPath = (
    sourceWaypoint: Waypoint,
    destinationWaypoint: Waypoint
  ): PathPoint[] => {
    // Create intermediate points for a more realistic path
    const intermediatePoints: PathPoint[] = [];

    // Add source waypoint
    intermediatePoints.push({
      lat: sourceWaypoint.lat,
      lng: sourceWaypoint.lng,
      isWaypoint: true,
      waypointId: sourceWaypoint.id,
    });

    // Calculate intermediate points based on nearby waypoints
    const nearbyWaypoints = waypoints.filter(
      (w) => w.id !== sourceWaypoint.id && w.id !== destinationWaypoint.id
    );

    // Simple pathfinding: find waypoints that create a reasonable route
    const pathWaypoints = findPathWaypoints(
      sourceWaypoint,
      destinationWaypoint,
      nearbyWaypoints
    );

    // Add intermediate waypoints to path
    pathWaypoints.forEach((waypoint) => {
      intermediatePoints.push({
        lat: waypoint.lat,
        lng: waypoint.lng,
        isWaypoint: true,
        waypointId: waypoint.id,
      });
    });

    // Add destination waypoint
    intermediatePoints.push({
      lat: destinationWaypoint.lat,
      lng: destinationWaypoint.lng,
      isWaypoint: true,
      waypointId: destinationWaypoint.id,
    });

    // Create smooth path with additional points between waypoints
    const smoothPath: PathPoint[] = [];
    for (let i = 0; i < intermediatePoints.length - 1; i++) {
      const current = intermediatePoints[i];
      const next = intermediatePoints[i + 1];

      smoothPath.push(current);

      // Add intermediate points for smooth animation
      const steps = 5; // Number of intermediate points between waypoints
      for (let j = 1; j < steps; j++) {
        const ratio = j / steps;
        smoothPath.push({
          lat: current.lat + (next.lat - current.lat) * ratio,
          lng: current.lng + (next.lng - current.lng) * ratio,
        });
      }
    }

    // Add final destination
    smoothPath.push(intermediatePoints[intermediatePoints.length - 1]);

    return smoothPath;
  };

  // Simple pathfinding algorithm to find intermediate waypoints
  const findPathWaypoints = (
    source: Waypoint,
    destination: Waypoint,
    availableWaypoints: Waypoint[]
  ): Waypoint[] => {
    // For simplicity, we'll use a greedy approach
    // In a real implementation, you'd use A* or Dijkstra's algorithm

    const path: Waypoint[] = [];
    const maxIntermediatePoints = 2; // Maximum intermediate waypoints

    // Calculate direct distance
    const directDistance = calculateDistance(
      source.lat,
      source.lng,
      destination.lat,
      destination.lng
    );

    // If distance is short, go direct
    if (directDistance < 5) {
      // Less than 5km, go direct
      return path;
    }

    // Find waypoints that are roughly on the path
    const candidateWaypoints = availableWaypoints.filter((waypoint) => {
      const distanceFromSource = calculateDistance(
        source.lat,
        source.lng,
        waypoint.lat,
        waypoint.lng
      );
      const distanceToDestination = calculateDistance(
        waypoint.lat,
        waypoint.lng,
        destination.lat,
        destination.lng
      );
      const totalDistance = distanceFromSource + distanceToDestination;

      // Include waypoint if it doesn't add too much extra distance
      return totalDistance < directDistance * 1.3; // Allow 30% extra distance
    });

    // Sort by distance from source and select up to maxIntermediatePoints
    candidateWaypoints
      .sort((a, b) => {
        const distA = calculateDistance(source.lat, source.lng, a.lat, a.lng);
        const distB = calculateDistance(source.lat, source.lng, b.lat, b.lng);
        return distA - distB;
      })
      .slice(0, maxIntermediatePoints)
      .forEach((waypoint) => path.push(waypoint));

    return path;
  };

  // Update the fetchVehicle function
  const fetchVehicle = async (vehicleId: number): Promise<Vehicle | null> => {
    try {
      const response = await fetch(
        `${API_BASE_URL_1}/api/simulator/get-vehicle?id=${vehicleId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: VehicleResponseDto = await response.json();

      if (data.vehicleDto) {
        return {
          id: data.vehicleDto.id,
          licensePlate: data.vehicleDto.licensePlate,
          model: data.vehicleDto.model,
          brand: data.vehicleDto.brand,
          type: data.vehicleDto.type,
          speed: selectedVehicleSpeed,
          initialDelay: selectedInitialDelay,
          status: "idle",
        };
      } else {
        throw new Error(data.message || "Vehicle not found");
      }
    } catch (error) {
      console.error("Error fetching vehicle:", error);
      toast({
        title: "Error",
        description: `Failed to fetch vehicle: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        variant: "destructive",
      });
      return null;
    }
  };

  // Handle waypoint selection based on current mode
  const handleWaypointSelect = (waypointId: number) => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can select waypoints",
        variant: "destructive",
      });
      return;
    }

    if (selectionMode === "source") {
      setSelectedSourceWaypoint(waypointId);
      setSelectionMode("destination");
      toast({
        title: "Source Selected",
        description: `Now select destination waypoint`,
      });
    } else {
      if (waypointId === selectedSourceWaypoint) {
        toast({
          title: "Error",
          description: "Destination cannot be the same as source",
          variant: "destructive",
        });
        return;
      }
      setSelectedDestinationWaypoint(waypointId);
      toast({
        title: "Destination Selected",
        description: `Route planned. Ready to place vehicle.`,
      });
    }
  };

  // Reset waypoint selection
  const resetSelection = () => {
    setSelectedSourceWaypoint(null);
    setSelectedDestinationWaypoint(null);
    setSelectionMode("source");
  };

  // Place vehicle with planned route
  const placeVehicle = async () => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can place vehicles",
        variant: "destructive",
      });
      return;
    }

    if (
      !selectedSourceWaypoint ||
      !selectedDestinationWaypoint ||
      !vehicleIdInput
    ) {
      toast({
        title: "Error",
        description:
          "Please select source, destination waypoints and enter vehicle ID",
        variant: "destructive",
      });
      return;
    }

    if (vehicles.length >= 10) {
      toast({
        title: "Error",
        description: "Maximum 10 vehicles allowed",
        variant: "destructive",
      });
      return;
    }

    // Check if vehicle ID is already placed
    const existingVehicle = vehicles.find(
      (v) => v.id === Number.parseInt(vehicleIdInput)
    );
    if (existingVehicle) {
      toast({
        title: "Error",
        description: "Vehicle is already placed on the map",
        variant: "destructive",
      });
      return;
    }

    const vehicleId = Number.parseInt(vehicleIdInput);
    const vehicle = await fetchVehicle(vehicleId);

    if (!vehicle) return;

    // Check if source waypoint already has a vehicle
    const sourceWaypoint = waypoints.find(
      (w) => w.id === selectedSourceWaypoint
    );
    const destinationWaypoint = waypoints.find(
      (w) => w.id === selectedDestinationWaypoint
    );

    if (!sourceWaypoint || !destinationWaypoint) {
      toast({
        title: "Error",
        description: "Invalid waypoint selection",
        variant: "destructive",
      });
      return;
    }

    // Calculate optimal path
    const plannedPath = calculateOptimalPath(
      sourceWaypoint,
      destinationWaypoint
    );

    // Create vehicle with planned path
    const vehicleWithPath: Vehicle = {
      ...vehicle,
      currentWaypoint: selectedSourceWaypoint,
      targetWaypoint: selectedDestinationWaypoint,
      speed: selectedVehicleSpeed,
      initialDelay: selectedInitialDelay,
      plannedPath: plannedPath,
    };

    // Update waypoint with vehicle - allow multiple vehicles
    setWaypoints((prev) =>
      prev.map((w) =>
        w.id === selectedSourceWaypoint ? { ...w, vehicle: vehicleWithPath } : w
      )
    );

    // Add vehicle to vehicles array
    setVehicles((prev) => [...prev, vehicleWithPath]);

    // Reset inputs
    setVehicleIdInput("");
    setSelectedInitialDelay(0);
    resetSelection();

    toast({
      title: "Success",
      description: `Vehicle ${vehicle.licensePlate} placed at ${
        sourceWaypoint.name
      } (${
        vehicles.filter((v) => v.currentWaypoint === selectedSourceWaypoint)
          .length + 1
      } vehicles at this waypoint)`,
    });
  };

  // Enhanced simulation with path following and broadcasting
  const startSimulation = () => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can start simulations",
        variant: "destructive",
      });
      return;
    }

    if (vehicles.length === 0) {
      toast({
        title: "Error",
        description: "No vehicles to simulate",
        variant: "destructive",
      });
      return;
    }

    setIsSimulationRunning(true);

    // Send notification about simulation start
    if (wsConnected) {
      sendNotification({
        title: "Simulation Started",
        content: `Vehicle simulation has been started with ${vehicles.length} vehicles`,
        type: "INFO",
      });
    }

    // ===== NEW BROADCASTING SYSTEM ACTIVATED =====
    console.log(
      "🚀 Starting simulation with enhanced real-time broadcasting system"
    );
    console.log(
      "📡 Admin will broadcast position updates directly from simulation loop"
    );
    console.log(
      "🎯 User clients will receive LIVE_POSITION_UPDATE messages for smooth tracking"
    );

    // 🐛 DEBUG: Log initial simulation conditions
    console.log(`🔧 ADMIN: Simulation setup:`, {
      totalVehicles: vehicles.length,
      wsConnected: wsConnected,
      userType: userType,
      playbackSpeed: playbackSpeed,
      intervalMs: Math.max(50, 200 / playbackSpeed),
      vehicleDetails: vehicles.map((v) => ({
        id: v.id,
        licensePlate: v.licensePlate,
        hasPath: !!v.plannedPath && v.plannedPath.length > 0,
        pathLength: v.plannedPath?.length || 0,
        initialDelay: v.initialDelay,
        speed: v.speed,
      })),
    });

    // Initialize simulation data for all vehicles with delay handling
    const initializedVehicles = vehicles.map((vehicle) => {
      if (!vehicle.plannedPath || vehicle.plannedPath.length === 0) {
        // Just return the original vehicle object
        return vehicle;
      }

      const currentTime = Date.now();
      const hasDelay = vehicle.initialDelay > 0;

      return {
        ...vehicle,
        status: hasDelay ? "idle" : ("moving" as const),
        simulationData: {
          avgSpeed: vehicle.speed,
          latitude: vehicle.plannedPath[0].lat,
          longitude: vehicle.plannedPath[0].lng,
          heading: 0,
          status: hasDelay ? "delayed" : "moving",
          timestamp: new Date().toISOString(),
          fuelLevel: Math.random() * 50 + 50,
          engineStatus: true,
          distanceTravelled: 0,
          startTime: hasDelay
            ? currentTime + vehicle.initialDelay * 1000
            : currentTime,
          currentLat: vehicle.plannedPath[0].lat,
          currentLng: vehicle.plannedPath[0].lng,
          progress: 0,
          pathIndex: 0,
          delayStartTime: hasDelay ? currentTime : undefined,
          isDelayed: hasDelay,
        },
      } as Vehicle;
    });

    setVehicles(initializedVehicles);

    console.log(
      "Broadcasting simulation start with vehicles:",
      initializedVehicles
    );

    // Broadcast simulation start to all users
    if (wsConnected) {
      broadcastSimulationUpdate({
        type: "SIMULATION_STARTED",
        data: {
          vehicles: initializedVehicles,
          playbackSpeed: playbackSpeed,
          isRunning: true,
          isPaused: false,
        },
        timestamp: Date.now(),
      });
    }

    // Start simulation loop
    simulationInterval.current = setInterval(() => {
      setVehicles((prev) => {
        const updatedVehicles = prev.map((vehicle) => {
          if (!vehicle.simulationData || !vehicle.plannedPath) {
            return vehicle;
          }

          const currentTime = Date.now();

          // Handle delayed vehicles
          if (
            vehicle.simulationData.isDelayed &&
            vehicle.simulationData.delayStartTime
          ) {
            const delayElapsed =
              currentTime - vehicle.simulationData.delayStartTime;
            const delayDuration = vehicle.initialDelay * 1000;

            if (delayElapsed < delayDuration) {
              // Still in delay period
              return {
                ...vehicle,
                status: "idle" as const,
                simulationData: {
                  ...vehicle.simulationData,
                  status: `delayed (${Math.ceil(
                    (delayDuration - delayElapsed) / 1000
                  )}s)`,
                },
              };
            } else {
              // Delay period ended, start moving
              // Send notification when vehicle starts moving
              if (wsConnected) {
                sendNotification({
                  title: "Vehicle Started Moving",
                  content: `Vehicle ${vehicle.licensePlate} has started its journey`,
                  type: "SUCCESS",
                });
              }

              return {
                ...vehicle,
                status: "moving" as const,
                simulationData: {
                  ...vehicle.simulationData,
                  isDelayed: false,
                  status: "moving",
                  startTime: currentTime, // Reset start time to now
                },
              };
            }
          }

          // Handle moving vehicles
          if (vehicle.status === "moving" && vehicle.simulationData.startTime) {
            const elapsedTime = currentTime - vehicle.simulationData.startTime;

            // Calculate total path distance
            const totalDistance = calculatePathDistance(vehicle.plannedPath);

            // Journey duration in milliseconds (adjusted for playback speed)
            const journeyDuration =
              ((totalDistance / (vehicle.speed / 3600)) * 1000) / playbackSpeed;

            // Calculate overall progress (0 to 1)
            const overallProgress = Math.min(elapsedTime / journeyDuration, 1);

            if (overallProgress >= 1) {
              // Vehicle reached final destination
              const finalPoint =
                vehicle.plannedPath[vehicle.plannedPath.length - 1];

              const updatedVehicle = {
                ...vehicle,
                currentWaypoint: vehicle.targetWaypoint,
                status: "stopped" as const,
                simulationData: {
                  ...vehicle.simulationData,
                  avgSpeed: vehicle.speed,
                  latitude: finalPoint.lat,
                  longitude: finalPoint.lng,
                  status: "completed",
                  timestamp: new Date().toISOString(),
                  distanceTravelled: totalDistance,
                  currentLat: finalPoint.lat,
                  currentLng: finalPoint.lng,
                  progress: 1,
                },
              };

              // Update waypoints - handle multiple vehicles per waypoint
              setWaypoints((prevWaypoints) =>
                prevWaypoints.map((w) => {
                  if (w.id === vehicle.targetWaypoint) {
                    return { ...w, vehicle: updatedVehicle };
                  }
                  return w;
                })
              );

              // Send notification when vehicle completes journey
              if (wsConnected) {
                sendNotification({
                  title: "Journey Complete",
                  content: `Vehicle ${vehicle.licensePlate} has reached its destination`,
                  type: "SUCCESS",
                });
              }

              toast({
                title: "Journey Complete",
                description: `Vehicle ${vehicle.licensePlate} reached destination`,
              });

              return updatedVehicle;
            } else {
              // Calculate current position along path
              const pathPosition = getPositionAlongPath(
                vehicle.plannedPath,
                overallProgress
              );

              // Calculate heading based on current direction
              const heading = pathPosition.heading || 0;

              return {
                ...vehicle,
                simulationData: {
                  ...vehicle.simulationData,
                  currentLat: pathPosition.lat,
                  currentLng: pathPosition.lng,
                  heading: heading,
                  progress: overallProgress,
                  distanceTravelled: totalDistance * overallProgress,
                },
              };
            }
          }

          return vehicle;
        });

        // 🐛 DEBUG: Check how many vehicles are moving after position updates
        const movingVehicles = updatedVehicles.filter(
          (v) => v.status === "moving"
        );
        console.log(
          `🎯 ADMIN: Position update complete - ${movingVehicles.length}/${updatedVehicles.length} vehicles moving`
        );

        if (movingVehicles.length > 0) {
          console.log(
            `📍 ADMIN: Moving vehicles positions:`,
            movingVehicles.map((v) => ({
              id: v.id,
              licensePlate: v.licensePlate,
              currentLat: v.simulationData?.currentLat?.toFixed(6),
              currentLng: v.simulationData?.currentLng?.toFixed(6),
              status: v.status,
            }))
          );
        }

        // ===== REAL-TIME POSITION BROADCASTING =====
        // This is the core fix: broadcast vehicle positions immediately after updating them
        // Only admin clients broadcast; user clients receive these updates
        if (wsConnected && userType === "admin") {
          // Calculate simulation statistics for dashboard
          const currentStats = {
            totalVehicles: updatedVehicles.length,
            activeVehicles: updatedVehicles.filter((v) => v.status === "moving")
              .length,
            completedJourneys: updatedVehicles.filter(
              (v) => v.status === "stopped"
            ).length,
          };

          // Create optimized position updates - only send essential data for moving vehicles
          // This reduces WebSocket payload size and improves performance
          const positionUpdates = updatedVehicles
            .filter(
              (v) =>
                v.status === "moving" &&
                v.simulationData?.currentLat &&
                v.simulationData?.currentLng
            )
            .map((vehicle) => ({
              id: vehicle.id,
              licensePlate: vehicle.licensePlate,
              currentLat: vehicle.simulationData.currentLat,
              currentLng: vehicle.simulationData.currentLng,
              heading: vehicle.simulationData.heading || 0,
              progress: vehicle.simulationData.progress || 0,
              status: vehicle.status,
              distanceTravelled: vehicle.simulationData.distanceTravelled || 0,
              timestamp: Date.now(), // Add timestamp for synchronization
            }));

          // Only broadcast if there are moving vehicles to avoid unnecessary network traffic
          if (positionUpdates.length > 0) {
            console.log(
              ` Broadcasting live positions for ${positionUpdates.length} moving vehicles:`,
              positionUpdates.map(
                (v) =>
                  `${v.licensePlate}: ${v.currentLat.toFixed(
                    4
                  )}, ${v.currentLng.toFixed(4)}`
              )
            );

            // 🐛 DEBUG: Log the exact data being broadcasted
            console.log(`📡 ADMIN: Broadcasting WebSocket message:`, {
              type: "LIVE_POSITION_UPDATE",
              vehicleCount: positionUpdates.length,
              wsConnected: wsConnected,
              userType: userType,
              timestamp: Date.now(),
            });

            // Send streamlined position data to all user clients
            broadcastSimulationUpdate({
              type: "LIVE_POSITION_UPDATE", // New message type for position updates
              data: {
                vehicles: positionUpdates,
                stats: currentStats,
                timestamp: Date.now(),
              },
            });

            console.log(`✅ ADMIN: WebSocket broadcast sent successfully`);
          } else {
            console.log(
              `⚠️ ADMIN: No moving vehicles to broadcast (${updatedVehicles.length} total vehicles)`
            );
          }

          // Also send full vehicle update periodically (every 10th iteration) for complete state sync
          // This ensures users don't miss any important vehicle state changes
          if (Math.random() < 0.1) {
            // Roughly every 10th update
            broadcastSimulationUpdate({
              type: "VEHICLE_UPDATE",
              data: {
                vehicles: updatedVehicles,
                stats: currentStats,
              },
              timestamp: Date.now(),
            });
          }
        }

        return updatedVehicles;
      });
    }, Math.max(50, 200 / playbackSpeed)); // Adjust interval based on playback speed, minimum 50ms

    // ===== REMOVED CONFLICTING LIVE LOCATION INTERVAL =====
    // The separate liveLocationInterval has been removed to prevent duplicate broadcasts.
    // Position updates are now handled directly in the main simulation loop above for better synchronization.
    // This eliminates timing conflicts and reduces unnecessary WebSocket traffic.

    /* DEPRECATED CODE - REMOVED TO FIX BROADCASTING ISSUES
    if (wsConnected && userType === "admin") {
      liveLocationInterval.current = setInterval(
        () => {
          setVehicles((currentVehicles) => {
            const movingVehicles = currentVehicles.filter(
              (v) =>
                v.status === "moving" &&
                v.simulationData?.currentLat &&
                v.simulationData?.currentLng
            );
            if (movingVehicles.length > 0) {
              console.log(
                "Broadcasting live location update for",
                movingVehicles.length,
                "moving vehicles"
              );
              broadcastLiveLocationUpdate(currentVehicles);
            }
            return currentVehicles; // Don't modify state, just broadcast
          });
        },
        Math.max(100, 300 / playbackSpeed) // Higher frequency for smoother updates
      );
    }
    */

    toast({
      title: "Simulation Started",
      description: "Vehicles will start according to their delay settings",
    });
  };

  // Add this new function after the startSimulation function
  const restartSimulationWithNewSpeed = () => {
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
    }
    if (liveLocationInterval.current) {
      clearInterval(liveLocationInterval.current);
    }

    // Restart simulation loop with new speed
    simulationInterval.current = setInterval(() => {
      setVehicles((prev) => {
        const updatedVehicles = prev.map((vehicle) => {
          // ... existing vehicle update logic remains the same
          if (!vehicle.simulationData || !vehicle.plannedPath) {
            return vehicle;
          }

          const currentTime = Date.now();

          // Handle delayed vehicles
          if (
            vehicle.simulationData.isDelayed &&
            vehicle.simulationData.delayStartTime
          ) {
            const delayElapsed =
              currentTime - vehicle.simulationData.delayStartTime;
            const delayDuration = vehicle.initialDelay * 1000;

            if (delayElapsed < delayDuration) {
              // Still in delay period
              return {
                ...vehicle,
                status: "idle" as const,
                simulationData: {
                  ...vehicle.simulationData,
                  status: `delayed (${Math.ceil(
                    (delayDuration - delayElapsed) / 1000
                  )}s)`,
                },
              };
            } else {
              // Delay period ended, start moving
              return {
                ...vehicle,
                status: "moving" as const,
                simulationData: {
                  ...vehicle.simulationData,
                  isDelayed: false,
                  status: "moving",
                  startTime: currentTime, // Reset start time to now
                },
              };
            }
          }

          // Handle moving vehicles
          if (vehicle.status === "moving" && vehicle.simulationData.startTime) {
            const elapsedTime = currentTime - vehicle.simulationData.startTime;

            // Calculate total path distance
            const totalDistance = calculatePathDistance(vehicle.plannedPath);

            // Journey duration in milliseconds (adjusted for playback speed)
            const journeyDuration =
              ((totalDistance / (vehicle.speed / 3600)) * 1000) / playbackSpeed;

            // Calculate overall progress (0 to 1)
            const overallProgress = Math.min(elapsedTime / journeyDuration, 1);

            if (overallProgress >= 1) {
              // Vehicle reached final destination
              const finalPoint =
                vehicle.plannedPath[vehicle.plannedPath.length - 1];

              const updatedVehicle = {
                ...vehicle,
                currentWaypoint: vehicle.targetWaypoint,
                status: "stopped" as const,
                simulationData: {
                  ...vehicle.simulationData,
                  avgSpeed: vehicle.speed,
                  latitude: finalPoint.lat,
                  longitude: finalPoint.lng,
                  status: "completed",
                  timestamp: new Date().toISOString(),
                  distanceTravelled: totalDistance,
                  currentLat: finalPoint.lat,
                  currentLng: finalPoint.lng,
                  progress: 1,
                },
              };

              // Update waypoints - handle multiple vehicles per waypoint
              setWaypoints((prevWaypoints) =>
                prevWaypoints.map((w) => {
                  if (w.id === vehicle.targetWaypoint) {
                    return { ...w, vehicle: updatedVehicle };
                  }
                  return w;
                })
              );

              toast({
                title: "Journey Complete",
                description: `Vehicle ${vehicle.licensePlate} reached destination`,
              });

              return updatedVehicle;
            } else {
              // Calculate current position along path
              const pathPosition = getPositionAlongPath(
                vehicle.plannedPath,
                overallProgress
              );

              // Calculate heading based on current direction
              const heading = pathPosition.heading || 0;

              return {
                ...vehicle,
                simulationData: {
                  ...vehicle.simulationData,
                  currentLat: pathPosition.lat,
                  currentLng: pathPosition.lng,
                  heading: heading,
                  progress: overallProgress,
                  distanceTravelled: totalDistance * overallProgress,
                },
              };
            }
          }

          return vehicle;
        });

        // Broadcast vehicle updates to all users
        if (wsConnected && userType === "admin") {
          const currentStats = {
            totalVehicles: updatedVehicles.length,
            activeVehicles: updatedVehicles.filter((v) => v.status === "moving")
              .length,
            completedJourneys: updatedVehicles.filter(
              (v) => v.status === "stopped"
            ).length,
          };

          broadcastSimulationUpdate({
            type: "VEHICLE_UPDATE",
            data: {
              vehicles: updatedVehicles,
              stats: currentStats,
            },
            timestamp: Date.now(),
          });
        }

        return updatedVehicles;
      });
    }, Math.max(50, 200 / playbackSpeed)); // Adjust interval based on playback speed, minimum 50ms

    // ===== LIVE LOCATION BROADCASTING REMOVED =====
    // No longer needed - position updates are now integrated into the main simulation loop
    // This prevents duplicate broadcasts and ensures better synchronization

    /* DEPRECATED CODE - REMOVED TO FIX BROADCASTING CONFLICTS
    if (wsConnected && userType === "admin") {
      liveLocationInterval.current = setInterval(() => {
        setVehicles((currentVehicles) => {
          const movingVehicles = currentVehicles.filter(
            (v) =>
              v.status === "moving" &&
              v.simulationData?.currentLat &&
              v.simulationData?.currentLng
          );
          if (movingVehicles.length > 0) {
            broadcastLiveLocationUpdate(currentVehicles);
          }
          return currentVehicles;
        });
      }, Math.max(100, 300 / playbackSpeed));
    }
    */
  };

  // Calculate total distance of a path
  const calculatePathDistance = (path: PathPoint[]): number => {
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      totalDistance += calculateDistance(
        path[i].lat,
        path[i].lng,
        path[i + 1].lat,
        path[i + 1].lng
      );
    }
    return totalDistance;
  };

  // Get position along path based on progress (0 to 1)
  const getPositionAlongPath = (
    path: PathPoint[],
    progress: number
  ): { lat: number; lng: number; heading?: number } => {
    if (progress <= 0) return { lat: path[0].lat, lng: path[0].lng };
    if (progress >= 1)
      return { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng };

    // Calculate distances for each segment
    const segmentDistances: number[] = [];
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const distance = calculateDistance(
        path[i].lat,
        path[i].lng,
        path[i + 1].lat,
        path[i + 1].lng
      );
      segmentDistances.push(distance);
      totalDistance += distance;
    }

    // Find which segment we're in
    const targetDistance = totalDistance * progress;
    let accumulatedDistance = 0;

    for (let i = 0; i < segmentDistances.length; i++) {
      if (accumulatedDistance + segmentDistances[i] >= targetDistance) {
        // We're in this segment
        const segmentProgress =
          (targetDistance - accumulatedDistance) / segmentDistances[i];
        const startPoint = path[i];
        const endPoint = path[i + 1];

        const lat =
          startPoint.lat + (endPoint.lat - startPoint.lat) * segmentProgress;
        const lng =
          startPoint.lng + (endPoint.lng - startPoint.lng) * segmentProgress;
        const heading = calculateBearing(
          startPoint.lat,
          startPoint.lng,
          endPoint.lat,
          endPoint.lng
        );

        return { lat, lng, heading };
      }
      accumulatedDistance += segmentDistances[i];
    }

    // Fallback to end point
    return { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng };
  };

  // Helper function to calculate distance between two points (Haversine formula)
  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Helper function to calculate bearing (direction) between two points
  const calculateBearing = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x =
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  // Pause simulation - completely stop the interval
  const pauseSimulation = () => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can pause simulations",
        variant: "destructive",
      });
      return;
    }

    setIsPaused(true);

    // Stop the simulation interval completely
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
    }

    // Stop live location updates
    if (liveLocationInterval.current) {
      clearInterval(liveLocationInterval.current);
      liveLocationInterval.current = null;
    }

    // Broadcast pause to all users
    if (wsConnected) {
      broadcastSimulationUpdate({
        type: "SIMULATION_PAUSED",
        data: { isPaused: true },
        timestamp: Date.now(),
      });
    }

    toast({
      title: "Simulation Paused",
      description: "Simulation has been paused",
    });
  };

  // Resume simulation - restart the interval
  const resumeSimulation = () => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can resume simulations",
        variant: "destructive",
      });
      return;
    }

    setIsPaused(false);

    // Broadcast resume to all users
    if (wsConnected) {
      broadcastSimulationUpdate({
        type: "SIMULATION_RESUMED",
        data: { isPaused: false },
        timestamp: Date.now(),
      });
    }

    // Restart the simulation loop
    restartSimulationWithNewSpeed();

    toast({
      title: "Simulation Resumed",
      description: "Simulation has been resumed",
    });
  };

  // Stop simulation
  const stopSimulation = () => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can stop simulations",
        variant: "destructive",
      });
      return;
    }

    setIsSimulationRunning(false);
    setIsPaused(false); // Reset pause state
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
    }
    if (liveLocationInterval.current) {
      clearInterval(liveLocationInterval.current);
    }

    const stoppedVehicles = vehicles.map((vehicle) => ({
      ...vehicle,
      status: "idle" as const,
    }));

    setVehicles(stoppedVehicles);

    // Broadcast stop to all users
    if (wsConnected) {
      broadcastSimulationUpdate({
        type: "SIMULATION_STOPPED",
        data: {
          vehicles: stoppedVehicles,
          isRunning: false,
          isPaused: false,
        },
        timestamp: Date.now(),
      });

      sendNotification({
        title: "Simulation Stopped",
        content: "Vehicle simulation has been stopped by admin",
        type: "WARNING",
      });
    }

    toast({
      title: "Simulation Stopped",
      description: "All vehicles have been stopped",
    });
  };

  // Change playback speed
  const changePlaybackSpeed = (speed: number) => {
    if (userType !== "admin") {
      toast({
        title: "Access Denied",
        description: "Only admins can change playback speed",
        variant: "destructive",
      });
      return;
    }

    setPlaybackSpeed(speed);

    // If simulation is running, restart it with new speed
    if (isSimulationRunning && !isPaused) {
      restartSimulationWithNewSpeed();
    }

    toast({
      title: "Playback Speed Changed",
      description: `Playback speed set to ${speed}x`,
    });
  };

  // Notification handlers
  const dismissNotification = (index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index));
  };

  const dismissAllNotifications = () => {
    setNotifications([]);
  };

  // ALL useEffect hooks must come here, before any conditional logic
  // Check authentication on component mount
  useEffect(() => {
    const checkAuth = () => {
      const loggedIn = localStorage.getItem("isLoggedIn") === "true";
      const storedUserType = localStorage.getItem("userType") as
        | "admin"
        | "user"
        | null;
      const storedEmail = localStorage.getItem("userEmail") || "";

      if (!loggedIn || !storedUserType) {
        router.push("/welcome");
        return;
      }

      setIsLoggedIn(loggedIn);
      setUserType(storedUserType);
      setUserEmail(storedEmail);
    };

    checkAuth();
  }, [router]);

  // Update simulation stats
  useEffect(() => {
    setSimulationStats({
      totalVehicles: vehicles.length,
      activeVehicles: vehicles.filter((v) => v.status === "moving").length,
      completedJourneys: vehicles.filter((v) => v.status === "stopped").length,
    });
  }, [vehicles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
      if (liveLocationInterval.current) {
        clearInterval(liveLocationInterval.current);
      }
    };
  }, []);

  // Playback speed effect
  useEffect(() => {
    if (isSimulationRunning && !isPaused && userType === "admin") {
      restartSimulationWithNewSpeed();
    }
  }, [playbackSpeed]);

  // Initialize waypoints and send to backend
  useEffect(() => {
    setWaypoints(ISLAMABAD_WAYPOINTS);

    // Send waypoints to backend when map loads
    if (!waypointsSent) {
      sendWaypointsToBackend(ISLAMABAD_WAYPOINTS);
    }
  }, [waypointsSent]);

  // NOW the conditional return can happen after all hooks
  // Don't render the main app if not authenticated
  if (!isLoggedIn || !userType) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userType");
    localStorage.removeItem("userEmail");

    // Stop any running simulation
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
    }
    if (liveLocationInterval.current) {
      clearInterval(liveLocationInterval.current);
    }

    toast({
      title: "Logged Out",
      description: "You have been successfully logged out",
    });

    router.push("/welcome");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Notification Popups */}
      <NotificationPopup
        notifications={notifications}
        onDismiss={dismissNotification}
        onDismissAll={dismissAllNotifications}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with User Info */}
        <div className="flex items-center justify-between">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              Vehicle Simulation System
            </h1>
            <p className="text-gray-600">
              Islamabad, Pakistan - Route Planning & Vehicle Simulation
            </p>
            <div className="flex items-center gap-2">
              {waypointsSent && (
                <Badge variant="secondary">Waypoints Synced</Badge>
              )}
              <Badge variant={wsConnected ? "default" : "destructive"}>
                {wsConnected
                  ? "🟢 Notifications Connected"
                  : "🔴 Notifications Offline"}
              </Badge>
              {isReceivingSimulation && userType === "user" && (
                <Badge variant="default" className="bg-green-600">
                  🔴 Live Simulation
                </Badge>
              )}
            </div>
          </div>

          {/* User Info and Logout */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border">
              {userType === "admin" ? (
                <Shield className="h-5 w-5 text-red-500" />
              ) : (
                <User className="h-5 w-5 text-blue-500" />
              )}
              <div className="text-sm">
                <div className="font-semibold capitalize">{userType}</div>
                <div className="text-gray-500 text-xs">{userEmail}</div>
              </div>
            </div>
            {userType === "admin" && (
              <Button
                onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                variant="outline"
                size="sm"
              >
                <Bell className="h-4 w-4 mr-2" />
                Notify
              </Button>
            )}
            <Button onClick={handleLogout} variant="outline" size="sm">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Access Level Notice for Users */}
        {userType === "user" && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900">
                    User Access Mode
                  </h3>
                  <p className="text-sm text-blue-700">
                    You can view live simulations started by admins. You'll
                    receive real-time updates and notifications.
                    {isReceivingSimulation && (
                      <span className="block mt-1 font-medium text-green-700">
                        🔴 Currently viewing live simulation
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin Notification Panel */}
        {userType === "admin" && showNotificationPanel && (
          <AdminNotificationPanel
            isConnected={wsConnected}
            onSendNotification={sendNotification}
          />
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Vehicles
              </CardTitle>
              <Car className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {simulationStats.totalVehicles}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Vehicles
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {simulationStats.activeVehicles}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Completed Journeys
              </CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {simulationStats.completedJourneys}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="h-5 w-5" />
                  Islamabad Map - Route Planning
                  {isReceivingSimulation && userType === "user" && (
                    <Badge
                      variant="default"
                      className="bg-red-600 text-white animate-pulse"
                    >
                      LIVE
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {userType === "admin"
                    ? selectionMode === "source"
                      ? "Click on a waypoint to select as SOURCE"
                      : "Click on a waypoint to select as DESTINATION"
                    : isReceivingSimulation
                    ? "Viewing live simulation from admin"
                    : "View-only mode - Wait for admin to start simulation"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96 w-full">
                  <MapComponent
                    waypoints={waypoints}
                    selectedSourceWaypoint={selectedSourceWaypoint}
                    selectedDestinationWaypoint={selectedDestinationWaypoint}
                    onWaypointSelect={handleWaypointSelect}
                    vehicles={vehicles}
                    selectionMode={selectionMode}
                  />
                  {/* 🐛 DEBUG: Hidden component to track vehicles prop changes */}
                  <div style={{ display: "none" }}>
                    {vehicles.length > 0 &&
                      console.log(
                        `🗺️ MapComponent vehicles prop:`,
                        vehicles.map((v) => ({
                          id: v.id,
                          licensePlate: v.licensePlate,
                          status: v.status,
                          currentLat: v.simulationData?.currentLat?.toFixed(6),
                          currentLng: v.simulationData?.currentLng?.toFixed(6),
                        }))
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div className="space-y-6">
            {/* Route Planning - Admin Only */}
            {userType === "admin" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Navigation className="h-5 w-5" />
                    Route Planning
                  </CardTitle>
                  <CardDescription>
                    Select source and destination waypoints
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Source Waypoint</Label>
                    <div className="p-2 bg-blue-50 rounded border-2 border-blue-200">
                      {selectedSourceWaypoint
                        ? waypoints.find((w) => w.id === selectedSourceWaypoint)
                            ?.name || "Unknown"
                        : "Click on map to select source"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Destination Waypoint</Label>
                    <div className="p-2 bg-green-50 rounded border-2 border-green-200">
                      {selectedDestinationWaypoint
                        ? waypoints.find(
                            (w) => w.id === selectedDestinationWaypoint
                          )?.name || "Unknown"
                        : "Select source first, then destination"}
                    </div>
                  </div>

                  <Button
                    onClick={resetSelection}
                    variant="outline"
                    className="w-full bg-transparent"
                  >
                    Reset Selection
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Vehicle Placement - Admin Only */}
            {userType === "admin" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    Vehicle Placement
                  </CardTitle>
                  <CardDescription>
                    Place vehicle with planned route
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle-id">Vehicle ID</Label>
                    <Input
                      id="vehicle-id"
                      type="number"
                      placeholder="Enter vehicle ID"
                      value={vehicleIdInput}
                      onChange={(e) => setVehicleIdInput(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vehicle-speed">Vehicle Speed (km/h)</Label>
                    <Input
                      id="vehicle-speed"
                      type="number"
                      min="10"
                      max="120"
                      value={selectedVehicleSpeed}
                      onChange={(e) =>
                        setSelectedVehicleSpeed(
                          Number.parseInt(e.target.value) || 50
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="initial-delay">
                      Initial Delay (seconds)
                    </Label>
                    <Input
                      id="initial-delay"
                      type="number"
                      min="0"
                      max="60"
                      value={selectedInitialDelay}
                      onChange={(e) =>
                        setSelectedInitialDelay(
                          Number.parseInt(e.target.value) || 0
                        )
                      }
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500">
                      Vehicle will wait this many seconds before starting
                    </p>
                  </div>

                  <Button
                    onClick={placeVehicle}
                    className="w-full"
                    disabled={
                      !selectedSourceWaypoint ||
                      !selectedDestinationWaypoint ||
                      !vehicleIdInput ||
                      vehicles.length >= 10
                    }
                  >
                    Place Vehicle with Route
                  </Button>

                  <p className="text-sm text-gray-500">
                    {vehicles.length}/10 vehicles placed
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Simulation Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Simulation Controls
                  {userType === "user" && (
                    <Badge variant="secondary" className="ml-2">
                      View Only
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    onClick={startSimulation}
                    disabled={
                      isSimulationRunning ||
                      vehicles.length === 0 ||
                      userType !== "admin"
                    }
                    className="flex-1"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start
                  </Button>
                  {isSimulationRunning && userType === "admin" && (
                    <Button
                      onClick={isPaused ? resumeSimulation : pauseSimulation}
                      variant="outline"
                      className="flex-1 bg-transparent"
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Square className="h-4 w-4 mr-2" />
                          Pause
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={stopSimulation}
                    disabled={!isSimulationRunning || userType !== "admin"}
                    variant="outline"
                    className="flex-1 bg-transparent"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </div>

                {/* Playback Speed Controls - Admin Only */}
                {isSimulationRunning && userType === "admin" && (
                  <div className="space-y-2">
                    <Label>Playback Speed: {playbackSpeed}x</Label>
                    <div className="flex gap-1">
                      {[0.5, 1, 1.5, 2, 3, 5].map((speed) => (
                        <Button
                          key={speed}
                          onClick={() => changePlaybackSpeed(speed)}
                          variant={
                            playbackSpeed === speed ? "default" : "outline"
                          }
                          size="sm"
                          className={
                            playbackSpeed !== speed ? "bg-transparent" : ""
                          }
                        >
                          {speed}x
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show current playback speed for users */}
                {userType === "user" && isReceivingSimulation && (
                  <div className="text-sm text-gray-600">
                    Current Speed:{" "}
                    <span className="font-medium">{playbackSpeed}x</span>
                  </div>
                )}

                {userType === "admin" && (
                  <>
                    <Button
                      onClick={saveSimulation}
                      disabled={vehicles.length === 0}
                      variant="secondary"
                      className="w-full"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Simulation
                    </Button>

                    <Button
                      onClick={fetchSimulationRecords}
                      disabled={isLoadingRecords}
                      variant="outline"
                      className="w-full bg-transparent"
                    >
                      {isLoadingRecords ? "Loading..." : "Simulation Records"}
                    </Button>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isSimulationRunning
                        ? isPaused
                          ? "bg-yellow-500"
                          : "bg-green-500"
                        : "bg-gray-400"
                    }`}
                  ></div>
                  <span className="text-sm">
                    {isSimulationRunning
                      ? isPaused
                        ? `Simulation Paused (${playbackSpeed}x)`
                        : `Simulation Running (${playbackSpeed}x)`
                      : "Simulation Stopped"}
                    {userType === "user" && isReceivingSimulation && (
                      <span className="text-green-600 font-medium">
                        {" "}
                        - Live View
                      </span>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Vehicle List */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Active Vehicles
                  {userType === "user" && isReceivingSimulation && (
                    <Badge
                      variant="default"
                      className="ml-2 bg-red-600 text-white"
                    >
                      LIVE
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {vehicles.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      {userType === "user"
                        ? "No active simulation"
                        : "No vehicles placed"}
                    </p>
                  ) : (
                    vehicles.map((vehicle) => {
                      const sourceWaypoint = waypoints.find(
                        (w) => w.id === vehicle.currentWaypoint
                      );
                      const destinationWaypoint = waypoints.find(
                        (w) => w.id === vehicle.targetWaypoint
                      );

                      return (
                        <div
                          key={vehicle.id}
                          className="p-2 bg-gray-50 rounded space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">
                              {vehicle.licensePlate}
                            </p>
                            <Badge
                              variant={
                                vehicle.status === "moving"
                                  ? "default"
                                  : vehicle.status === "stopped"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {vehicle.status === "idle"
                                ? vehicle.simulationData?.status || "idle"
                                : vehicle.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500">
                            {vehicle.brand} {vehicle.model} - {vehicle.speed}{" "}
                            km/h
                          </p>
                          {vehicle.initialDelay > 0 && (
                            <p className="text-xs text-orange-600">
                              Delay: {vehicle.initialDelay}s
                            </p>
                          )}
                          <p className="text-xs text-gray-600">
                            {sourceWaypoint?.name} → {destinationWaypoint?.name}
                          </p>
                          {vehicle.simulationData?.progress && (
                            <div className="w-full bg-gray-200 rounded-full h-1">
                              <div
                                className="bg-blue-600 h-1 rounded-full transition-all duration-200"
                                style={{
                                  width: `${Math.round(
                                    vehicle.simulationData.progress * 100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          )}
                          {vehicle.status === "moving" &&
                            vehicle.simulationData && (
                              <p className="text-xs text-green-600">
                                Live:{" "}
                                {vehicle.simulationData.currentLat?.toFixed(4)},{" "}
                                {vehicle.simulationData.currentLng?.toFixed(4)}
                              </p>
                            )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Simulation Records List - Admin Only */}
            {showRecordsList && userType === "admin" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Simulation Records</CardTitle>
                    <Button
                      onClick={() => setShowRecordsList(false)}
                      variant="ghost"
                      size="sm"
                    >
                      ✕
                    </Button>
                  </div>
                  <CardDescription>
                    Click on a record to load it (editable before running)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {simulationRecords.length === 0 ? (
                      <p className="text-gray-500 text-sm">
                        No simulation records found
                      </p>
                    ) : (
                      simulationRecords.map((record) => (
                        <div
                          key={record.simulationId}
                          className="p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors border-l-4 border-blue-500"
                          onClick={() => loadSimulationRecord(record)}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-blue-700">
                              {record.name}
                            </p>
                            <Badge variant="outline">
                              {record.vehicles.length} vehicles
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            ID: {record.simulationId} | Waypoints:{" "}
                            {record.waypoints.length}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Vehicles:{" "}
                            {record.vehicles
                              .map((v) => `ID:${v.vehicle_id}`)
                              .join(", ")}
                          </p>
                          <div className="text-xs text-gray-400 mt-1">
                            Speeds:{" "}
                            {record.vehicles
                              .map((v) => `${v.speed}km/h`)
                              .join(", ")}
                            {record.vehicles.some(
                              (v) => v.initialDelay > 0
                            ) && (
                              <span className="ml-2">
                                | Delays:{" "}
                                {record.vehicles
                                  .filter((v) => v.initialDelay > 0)
                                  .map((v) => `${v.initialDelay}s`)
                                  .join(", ")}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-green-600 font-medium">
                            ✓ Click to load (editable)
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
