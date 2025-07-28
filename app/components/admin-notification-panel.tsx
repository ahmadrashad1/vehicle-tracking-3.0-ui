"use client"

import { useState } from "react"
import { Send, Users, AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import type { NotificationMessage } from "../../hooks/use-websocket"

interface AdminNotificationPanelProps {
  isConnected: boolean
  onSendNotification: (message: NotificationMessage) => void
}

export default function AdminNotificationPanel({ isConnected, onSendNotification }: AdminNotificationPanelProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [type, setType] = useState<NotificationMessage["type"]>("INFO")
  const [isSending, setIsSending] = useState(false)

  const handleSendNotification = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both title and content",
        variant: "destructive",
      })
      return
    }

    if (!isConnected) {
      toast({
        title: "Error",
        description: "WebSocket not connected. Cannot send notification.",
        variant: "destructive",
      })
      return
    }

    setIsSending(true)

    try {
      const notification: NotificationMessage = {
        title: title.trim(),
        content: content.trim(),
        type: type,
      }

      onSendNotification(notification)

      // Clear form
      setTitle("")
      setContent("")
      setType("INFO")

      toast({
        title: "Notification Sent",
        description: "Notification has been broadcast to all connected users",
      })
    } catch (error) {
      console.error("Error sending notification:", error)
      toast({
        title: "Error",
        description: "Failed to send notification",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  const getTypeIcon = (notificationType: NotificationMessage["type"]) => {
    switch (notificationType) {
      case "SUCCESS":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "WARNING":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case "ERROR":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const quickNotifications = [
    {
      title: "System Maintenance",
      content: "System maintenance will begin in 10 minutes. Please save your work.",
      type: "WARNING" as const,
    },
    {
      title: "Simulation Update",
      content: "New simulation features are now available. Check them out!",
      type: "SUCCESS" as const,
    },
    {
      title: "Connection Issue",
      content: "If you experience connection issues, please refresh your browser.",
      type: "ERROR" as const,
    },
    {
      title: "Welcome Message",
      content: "Welcome to the Vehicle Simulation System. Enjoy exploring!",
      type: "INFO" as const,
    },
  ]

  const handleQuickNotification = (notification: {
    title: string
    content: string
    type: NotificationMessage["type"]
  }) => {
    setTitle(notification.title)
    setContent(notification.content)
    setType(notification.type)
  }

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-orange-600" />
          Admin Notification Panel
          <Badge variant={isConnected ? "default" : "destructive"} className="ml-2">
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Send notifications to all connected users. Messages will appear as popup notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick notification templates */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Quick Templates</Label>
          <div className="grid grid-cols-2 gap-2">
            {quickNotifications.map((notification, index) => (
              <Button
                key={index}
                onClick={() => handleQuickNotification(notification)}
                variant="outline"
                size="sm"
                className="justify-start text-left h-auto p-2 bg-white"
                disabled={isSending}
              >
                <div className="flex items-start gap-2">
                  {getTypeIcon(notification.type)}
                  <div className="text-xs">
                    <div className="font-medium">{notification.title}</div>
                    <div className="text-gray-500 truncate">{notification.content.substring(0, 30)}...</div>
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Custom notification form */}
        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="notification-title">Title</Label>
            <Input
              id="notification-title"
              placeholder="Enter notification title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-content">Content</Label>
            <Textarea
              id="notification-content"
              placeholder="Enter notification message"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              disabled={isSending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-type">Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as NotificationMessage["type"])}>
              <SelectTrigger>
                <SelectValue placeholder="Select notification type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INFO">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-500" />
                    Info
                  </div>
                </SelectItem>
                <SelectItem value="SUCCESS">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Success
                  </div>
                </SelectItem>
                <SelectItem value="WARNING">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Warning
                  </div>
                </SelectItem>
                <SelectItem value="ERROR">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Error
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSendNotification}
            disabled={!isConnected || isSending || !title.trim() || !content.trim()}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? "Sending..." : "Send Notification"}
          </Button>

          {!isConnected && (
            <p className="text-sm text-red-600 text-center">WebSocket connection required to send notifications</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
