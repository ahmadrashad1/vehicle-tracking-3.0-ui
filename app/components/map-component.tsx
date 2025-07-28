"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Waypoint, Vehicle } from "../page";

// Fix for default markers in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapComponentProps {
  waypoints: Waypoint[];
  selectedSourceWaypoint: number | null;
  selectedDestinationWaypoint: number | null;
  onWaypointSelect: (waypointId: number) => void;
  vehicles: Vehicle[];
  selectionMode: "source" | "destination";
}

export default function MapComponent({
  waypoints,
  selectedSourceWaypoint,
  selectedDestinationWaypoint,
  onWaypointSelect,
  vehicles,
  selectionMode,
}: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ [key: number]: L.Marker }>({});
  const vehicleMarkersRef = useRef<{ [key: number]: L.Marker }>({});
  const pathLayersRef = useRef<{ [key: number]: L.Polyline }>({});
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create map centered on Islamabad
    const map = L.map(mapContainerRef.current, {
      center: [33.7077, 73.0563], // Blue Area, Islamabad
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
    });

    // Add OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    setIsMapReady(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker) => {
      mapRef.current?.removeLayer(marker);
    });
    markersRef.current = {};

    // Add waypoint markers
    waypoints.forEach((waypoint) => {
      let iconColor = "blue";
      let iconSize: [number, number] = [25, 41];

      // Determine marker color based on selection
      if (waypoint.id === selectedSourceWaypoint) {
        iconColor = "green";
        iconSize = [30, 49];
      } else if (waypoint.id === selectedDestinationWaypoint) {
        iconColor = "red";
        iconSize = [30, 49];
      } else if (selectionMode === "source") {
        iconColor = "lightblue";
      } else if (selectionMode === "destination" && selectedSourceWaypoint) {
        iconColor = "orange";
      }

      // Create custom icon
      const customIcon = L.divIcon({
        className: "custom-waypoint-marker",
        html: `
          <div style="
            background-color: ${iconColor};
            width: ${iconSize[0]}px;
            height: ${iconSize[1]}px;
            border-radius: 50% 50% 50% 0;
            border: 3px solid white;
            transform: rotate(-45deg);
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          ">
            <div style="
              color: white;
              font-weight: bold;
              font-size: 12px;
              transform: rotate(45deg);
            ">${waypoint.id}</div>
          </div>
        `,
        iconSize: iconSize,
        iconAnchor: [iconSize[0] / 2, iconSize[1]],
        popupAnchor: [0, -iconSize[1]],
      });

      const marker = L.marker([waypoint.lat, waypoint.lng], {
        icon: customIcon,
      })
        .addTo(mapRef.current!)
        .bindPopup(
          `
          <div style="text-align: center;">
            <strong>${waypoint.name}</strong><br>
            <small>ID: ${waypoint.id}</small><br>
            <small>Lat: ${waypoint.lat.toFixed(4)}, Lng: ${waypoint.lng.toFixed(
            4
          )}</small>
            ${
              waypoint.vehicle
                ? `<br><small>🚗 Vehicle: ${waypoint.vehicle.licensePlate}</small>`
                : ""
            }
          </div>
        `
        )
        .on("click", () => {
          onWaypointSelect(waypoint.id);
        });

      markersRef.current[waypoint.id] = marker;
    });
  }, [
    waypoints,
    selectedSourceWaypoint,
    selectedDestinationWaypoint,
    selectionMode,
    onWaypointSelect,
    isMapReady,
  ]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;

    console.log("Updating vehicle markers for", vehicles.length, "vehicles");

    // Update existing vehicle markers or create new ones
    vehicles.forEach((vehicle) => {
      // Draw or update planned path
      if (vehicle.plannedPath && vehicle.plannedPath.length > 1) {
        // Remove existing path for this vehicle
        if (pathLayersRef.current[vehicle.id]) {
          mapRef.current?.removeLayer(pathLayersRef.current[vehicle.id]);
        }

        const pathCoords: [number, number][] = vehicle.plannedPath.map(
          (point) => [point.lat, point.lng]
        );

        const pathColor =
          vehicle.status === "moving"
            ? "#22c55e"
            : vehicle.status === "stopped"
            ? "#ef4444"
            : "#6b7280";

        const pathLine = L.polyline(pathCoords, {
          color: pathColor,
          weight: 3,
          opacity: 0.7,
          dashArray: vehicle.status === "idle" ? "5, 5" : undefined,
        }).addTo(mapRef.current!);

        pathLayersRef.current[vehicle.id] = pathLine;
      }

      // Determine vehicle position - FIXED: Prioritize live coordinates
      let vehicleLat = 0;
      let vehicleLng = 0;

      if (
        vehicle.simulationData?.currentLat &&
        vehicle.simulationData?.currentLng
      ) {
        // Use live coordinates if available (this is the key fix!)
        vehicleLat = vehicle.simulationData.currentLat;
        vehicleLng = vehicle.simulationData.currentLng;
        console.log(
          `Vehicle ${vehicle.licensePlate} live position:`,
          vehicleLat,
          vehicleLng
        );
      } else if (vehicle.plannedPath && vehicle.plannedPath.length > 0) {
        // Use first point of planned path as fallback
        vehicleLat = vehicle.plannedPath[0].lat;
        vehicleLng = vehicle.plannedPath[0].lng;
        console.log(
          `Vehicle ${vehicle.licensePlate} using planned path start:`,
          vehicleLat,
          vehicleLng
        );
      } else {
        // Use waypoint coordinates as last resort
        const waypoint = waypoints.find(
          (w) => w.id === vehicle.currentWaypoint
        );
        if (waypoint) {
          vehicleLat = waypoint.lat;
          vehicleLng = waypoint.lng;
          console.log(
            `Vehicle ${vehicle.licensePlate} using waypoint position:`,
            vehicleLat,
            vehicleLng
          );
        }
      }

      if (vehicleLat && vehicleLng) {
        // Create vehicle icon based on status
        let vehicleColor = "#6b7280"; // gray for idle
        let vehicleIcon = "🚗";

        if (vehicle.status === "moving") {
          vehicleColor = "#22c55e"; // green for moving
          vehicleIcon = "🚗";
        } else if (vehicle.status === "stopped") {
          vehicleColor = "#ef4444"; // red for stopped
          vehicleIcon = "🏁";
        }

        // Calculate rotation based on heading
        const rotation = vehicle.simulationData?.heading || 0;

        const vehicleMarkerIcon = L.divIcon({
          className: "custom-vehicle-marker",
          html: `
            <div style="
              background-color: ${vehicleColor};
              width: 30px;
              height: 30px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${rotation}deg);
              transition: all 0.3s ease;
              ${
                vehicle.status === "moving"
                  ? "animation: pulse 2s infinite;"
                  : ""
              }
            ">
              <div style="
                font-size: 16px;
                transform: rotate(-${rotation}deg);
              ">${vehicleIcon}</div>
            </div>
            <style>
              @keyframes pulse {
                0%, 100% { transform: rotate(${rotation}deg) scale(1); }
                50% { transform: rotate(${rotation}deg) scale(1.1); }
              }
            </style>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -15],
        });

        // FIXED: Update existing marker position or create new one
        if (vehicleMarkersRef.current[vehicle.id]) {
          // Update existing marker position
          const existingMarker = vehicleMarkersRef.current[vehicle.id];
          existingMarker.setLatLng([vehicleLat, vehicleLng]);
          existingMarker.setIcon(vehicleMarkerIcon);
          console.log(
            `Updated vehicle ${vehicle.licensePlate} marker position to:`,
            vehicleLat,
            vehicleLng
          );
        } else {
          // Create new marker
          const vehicleMarker = L.marker([vehicleLat, vehicleLng], {
            icon: vehicleMarkerIcon,
          })
            .addTo(mapRef.current!)
            .bindPopup(
              `
              <div style="text-align: center;">
                <strong>🚗 ${vehicle.licensePlate}</strong><br>
                <small>${vehicle.brand} ${vehicle.model}</small><br>
                <small>Status: <span style="color: ${vehicleColor};">${
                vehicle.status
              }</span></small><br>
                <small>Speed: ${vehicle.speed} km/h</small><br>
                ${
                  vehicle.simulationData?.progress
                    ? `<small>Progress: ${Math.round(
                        vehicle.simulationData.progress * 100
                      )}%</small><br>`
                    : ""
                }
                ${
                  vehicle.simulationData?.currentLat &&
                  vehicle.simulationData?.currentLng
                    ? `<small>Live: ${vehicle.simulationData.currentLat.toFixed(
                        4
                      )}, ${vehicle.simulationData.currentLng.toFixed(
                        4
                      )}</small>`
                    : ""
                }
              </div>
            `
            );

          vehicleMarkersRef.current[vehicle.id] = vehicleMarker;
          console.log(
            `Created new vehicle ${vehicle.licensePlate} marker at:`,
            vehicleLat,
            vehicleLng
          );
        }
      }
    });

    // Remove markers for vehicles that no longer exist
    Object.keys(vehicleMarkersRef.current).forEach((vehicleIdStr) => {
      const vehicleId = Number.parseInt(vehicleIdStr);
      if (!vehicles.find((v) => v.id === vehicleId)) {
        mapRef.current?.removeLayer(vehicleMarkersRef.current[vehicleId]);
        delete vehicleMarkersRef.current[vehicleId];

        // Also remove path
        if (pathLayersRef.current[vehicleId]) {
          mapRef.current?.removeLayer(pathLayersRef.current[vehicleId]);
          delete pathLayersRef.current[vehicleId];
        }
      }
    });
  }, [vehicles, waypoints, isMapReady]);

  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach((marker) => {
        mapRef.current?.removeLayer(marker);
      });
      Object.values(vehicleMarkersRef.current).forEach((marker) => {
        mapRef.current?.removeLayer(marker);
      });
      Object.values(pathLayersRef.current).forEach((path) => {
        mapRef.current?.removeLayer(path);
      });
    };
  }, []);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-lg overflow-hidden border border-gray-200"
      style={{ minHeight: "400px" }}
    />
  );
}
