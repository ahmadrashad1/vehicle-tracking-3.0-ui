"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Client } from "@stomp/stompjs"

export interface NotificationMessage {
  title: string
  content: string
  type: "INFO" | "WARNING" | "SUCCESS" | "ERROR"
}

export interface SimulationStateMessage {
  type:
    | "SIMULATION_STARTED"
    | "SIMULATION_STOPPED"
    | "SIMULATION_PAUSED"
    | "SIMULATION_RESUMED"
    | "VEHICLE_UPDATE"
    | "SIMULATION_STATE"
    | "LIVE_LOCATION_UPDATE"
  data: any
  timestamp: number
}

interface UseWebSocketProps {
  url: string
  onNotification?: (message: NotificationMessage) => void
  onSimulationUpdate?: (message: SimulationStateMessage) => void
  enabled?: boolean
}

export function useWebSocket({ url, onNotification, onSimulationUpdate, enabled = true }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const clientRef = useRef<Client | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const maxReconnectAttempts = 10
  const baseReconnectDelay = 1000 // Start with 1 second

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (clientRef.current) {
      try {
        if (clientRef.current.active) {
          clientRef.current.deactivate()
        }
      } catch (error) {
        console.error("Error during cleanup:", error)
      }
      clientRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabled) return

    cleanup()

    // Calculate exponential backoff delay
    const delay = Math.min(
      baseReconnectDelay * Math.pow(2, reconnectAttempts),
      30000, // Max 30 seconds
    )

    if (reconnectAttempts > 0) {
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`)
      reconnectTimeoutRef.current = setTimeout(() => {
        createConnection()
      }, delay)
    } else {
      createConnection()
    }
  }, [enabled, reconnectAttempts])

  const createConnection = useCallback(() => {
    if (!enabled) return

    const client = new Client({
      // Use native WebSocket instead of SockJS for better stability
      webSocketFactory: () => new WebSocket(url.replace("http", "ws")),

      connectHeaders: {
        "Accept-Version": "1.0,1.1,1.2",
        "heart-beat": "10000,10000", // Send heartbeat every 10s, expect every 10s
      },

      debug: (str) => {
        if (process.env.NODE_ENV === "development") {
          console.log("STOMP Debug:", str)
        }
      },

      // Heartbeat configuration - crucial for connection stability
      heartbeatIncoming: 10000, // Expect heartbeat from server every 10 seconds
      heartbeatOutgoing: 10000, // Send heartbeat to server every 10 seconds

      // Disable automatic reconnection - we'll handle it manually
      reconnectDelay: 0,

      // Connection timeout
      connectionTimeout: 10000,
    })

    client.onConnect = (frame) => {
      console.log("WebSocket connected successfully", frame)
      setIsConnected(true)
      setConnectionError(null)
      setReconnectAttempts(0) // Reset reconnect attempts on successful connection

      try {
        // Subscribe to global notifications
        const notificationSub = client.subscribe("/topic/notifications", (message) => {
          try {
            console.log("Raw notification message received:", message.body)
            const notification: NotificationMessage = JSON.parse(message.body)
            console.log("Parsed notification:", notification)
            onNotification?.(notification)
          } catch (error) {
            console.error("Error parsing notification:", error, "Raw message:", message.body)
          }
        })

        // Subscribe to simulation updates
        const simulationSub = client.subscribe("/topic/simulation", (message) => {
          try {
            console.log("Raw simulation message received:", message.body)
            const simulationUpdate: SimulationStateMessage = JSON.parse(message.body)
            console.log("Parsed simulation update:", simulationUpdate)
            onSimulationUpdate?.(simulationUpdate)
          } catch (error) {
            console.error("Error parsing simulation update:", error, "Raw message:", message.body)
          }
        })

        // Subscribe to live location updates - ENHANCED for real-time vehicle positions
        const locationSub = client.subscribe("/topic/live-locations", (message) => {
          try {
            console.log("Raw live location message received:", message.body)
            const locationUpdate: SimulationStateMessage = JSON.parse(message.body)
            console.log("Parsed live location update:", locationUpdate)

            // Process live location updates immediately for smooth vehicle movement
            if (locationUpdate.type === "LIVE_LOCATION_UPDATE") {
              console.log("Processing live vehicle positions:", locationUpdate.data.vehicles?.length || 0, "vehicles")
              locationUpdate.data.vehicles?.forEach((vehicle: any) => {
                if (vehicle.currentLat && vehicle.currentLng) {
                  console.log(
                    `Vehicle ${vehicle.licensePlate} live position: ${vehicle.currentLat}, ${vehicle.currentLng}`,
                  )
                }
              })
            }

            onSimulationUpdate?.(locationUpdate)
          } catch (error) {
            console.error("Error parsing live location update:", error, "Raw message:", message.body)
          }
        })

        console.log("Successfully subscribed to all topics (notifications, simulation, live-locations)")

        // Store subscriptions for cleanup
        client.subscriptions = { notificationSub, simulationSub, locationSub }

        // Request current simulation state after successful connection
        setTimeout(() => {
          if (client.connected) {
            try {
              console.log("Requesting current simulation state...")
              client.publish({
                destination: "/app/simulation/request-state",
                body: JSON.stringify({ action: "REQUEST_CURRENT_STATE" }),
                headers: {
                  "content-type": "application/json",
                },
              })
            } catch (error) {
              console.error("Error requesting simulation state:", error)
            }
          }
        }, 500)
      } catch (error) {
        console.error("Error setting up subscriptions:", error)
      }
    }

    client.onDisconnect = (frame) => {
      console.log("WebSocket disconnected", frame)
      setIsConnected(false)

      // Only attempt reconnection if we haven't exceeded max attempts and still enabled
      if (enabled && reconnectAttempts < maxReconnectAttempts) {
        setReconnectAttempts((prev) => prev + 1)
        connect()
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        setConnectionError("Max reconnection attempts reached")
      }
    }

    client.onStompError = (frame) => {
      const errorMessage = frame.headers["message"] || "STOMP protocol error"
      console.error("STOMP error:", errorMessage, frame)
      setConnectionError(errorMessage)
      setIsConnected(false)

      // Attempt reconnection on STOMP errors
      if (enabled && reconnectAttempts < maxReconnectAttempts) {
        setReconnectAttempts((prev) => prev + 1)
        connect()
      }
    }

    client.onWebSocketError = (error) => {
      console.error("WebSocket error:", error)
      setConnectionError("WebSocket connection failed")
      setIsConnected(false)

      // Attempt reconnection on WebSocket errors
      if (enabled && reconnectAttempts < maxReconnectAttempts) {
        setReconnectAttempts((prev) => prev + 1)
        connect()
      }
    }

    client.onWebSocketClose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason)
      setIsConnected(false)

      // Handle different close codes
      if (event.code !== 1000 && enabled && reconnectAttempts < maxReconnectAttempts) {
        setReconnectAttempts((prev) => prev + 1)
        connect()
      }
    }

    clientRef.current = client

    try {
      console.log("Activating WebSocket client...")
      client.activate()
    } catch (error) {
      console.error("Error activating client:", error)
      setConnectionError("Failed to activate WebSocket client")
    }
  }, [enabled, reconnectAttempts, url, onNotification, onSimulationUpdate])

  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      cleanup()
      setIsConnected(false)
      setConnectionError(null)
      setReconnectAttempts(0)
    }

    return cleanup
  }, [enabled, connect, cleanup])

  // Reset connection on URL change
  useEffect(() => {
    if (enabled) {
      setReconnectAttempts(0)
      connect()
    }
  }, [url])

  const sendNotification = useCallback((message: NotificationMessage) => {
    if (clientRef.current && clientRef.current.connected) {
      try {
        console.log("Sending notification:", message)
        const messageBody = JSON.stringify(message)
        console.log("Notification message body:", messageBody)

        clientRef.current.publish({
          destination: "/app/notify",
          body: messageBody,
          headers: {
            "content-type": "application/json",
          },
        })
        console.log("Notification sent successfully")
      } catch (error) {
        console.error("Error sending notification:", error)
      }
    } else {
      console.error("WebSocket not connected - cannot send notification")
    }
  }, [])

  const broadcastSimulationUpdate = useCallback((update: SimulationStateMessage) => {
    if (clientRef.current && clientRef.current.connected) {
      try {
        console.log(
          "Broadcasting simulation update:",
          update.type,
          "with",
          update.data.vehicles?.length || 0,
          "vehicles",
        )
        const messageBody = JSON.stringify(update)

        // Choose destination based on update type
        let destination = "/app/simulation/update"
        if (update.type === "LIVE_LOCATION_UPDATE") {
          destination = "/app/live-locations/update"
          console.log("Broadcasting live location update to:", destination)
        }

        clientRef.current.publish({
          destination: destination,
          body: messageBody,
          headers: {
            "content-type": "application/json",
          },
        })
        console.log("Simulation update broadcast successfully to:", destination)
      } catch (error) {
        console.error("Error broadcasting simulation update:", error)
      }
    } else {
      console.error("WebSocket not connected - cannot broadcast simulation update")
    }
  }, [])

  const forceReconnect = useCallback(() => {
    setReconnectAttempts(0)
    setConnectionError(null)
    connect()
  }, [connect])

  return {
    isConnected,
    connectionError,
    reconnectAttempts,
    maxReconnectAttempts,
    sendNotification,
    broadcastSimulationUpdate,
    forceReconnect,
  }
}
