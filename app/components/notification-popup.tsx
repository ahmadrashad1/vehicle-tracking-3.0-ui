"use client"

import { useEffect, useState } from "react"
import { X, Bell, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { NotificationMessage } from "../../hooks/use-websocket"

interface NotificationPopupProps {
  notifications: NotificationMessage[]
  onDismiss: (index: number) => void
  onDismissAll: () => void
}

export default function NotificationPopup({ notifications, onDismiss, onDismissAll }: NotificationPopupProps) {
  const [visibleNotifications, setVisibleNotifications] = useState<NotificationMessage[]>([])

  useEffect(() => {
    // Show only the last 3 notifications
    setVisibleNotifications(notifications.slice(-3))
  }, [notifications])

  if (visibleNotifications.length === 0) return null

  const getNotificationIcon = (type: NotificationMessage["type"]) => {
    switch (type) {
      case "SUCCESS":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "WARNING":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case "ERROR":
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Info className="h-5 w-5 text-blue-500" />
    }
  }

  const getNotificationColor = (type: NotificationMessage["type"]) => {
    switch (type) {
      case "SUCCESS":
        return "border-green-200 bg-green-50"
      case "WARNING":
        return "border-yellow-200 bg-yellow-50"
      case "ERROR":
        return "border-red-200 bg-red-50"
      default:
        return "border-blue-200 bg-blue-50"
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {/* Header with dismiss all button */}
      {notifications.length > 1 && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600">{notifications.length} notifications</span>
          </div>
          <Button onClick={onDismissAll} variant="ghost" size="sm" className="h-6 px-2 text-xs">
            Dismiss All
          </Button>
        </div>
      )}

      {/* Notification cards */}
      {visibleNotifications.map((notification, index) => {
        const actualIndex = notifications.length - visibleNotifications.length + index
        return (
          <Card
            key={actualIndex}
            className={`${getNotificationColor(notification.type)} border-l-4 shadow-lg animate-in slide-in-from-right duration-300`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(notification.type)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm text-gray-900 mb-1">{notification.title}</h4>
                      <p className="text-sm text-gray-700 leading-relaxed">{notification.content}</p>
                    </div>

                    <Button
                      onClick={() => onDismiss(actualIndex)}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-gray-200/50 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="outline" className="text-xs">
                      {notification.type}
                    </Badge>
                    <span className="text-xs text-gray-500">{new Date().toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Show indicator if there are more notifications */}
      {notifications.length > 3 && (
        <div className="text-center">
          <Badge variant="secondary" className="text-xs">
            +{notifications.length - 3} more notifications
          </Badge>
        </div>
      )}
    </div>
  )
}
