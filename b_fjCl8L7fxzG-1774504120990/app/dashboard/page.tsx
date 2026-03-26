"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, LogOut, Plus } from "lucide-react"

// 模拟酒店数据 - 每个酒店只有一个总状态
const mockHotels = [
  { id: "00311", name: "Tokyo Yaesu", available: true },
  { id: "00156", name: "Osaka Namba", available: true },
  { id: "00089", name: "Kyoto Shijo", available: false },
  { id: "00234", name: "Nagoya", available: true },
  { id: "00412", name: "Fukuoka", available: false },
]

interface Notification {
  id: number
  hotel: string
  time: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: 1, hotel: "Tokyo Yaesu", time: "2min" },
  ])

  // 测试通知功能
  const addTestNotification = () => {
    const hotels = ["Osaka Namba", "Kyoto Shijo", "Nagoya", "Tokyo Yaesu", "Fukuoka"]
    const newNotification: Notification = {
      id: Date.now(),
      hotel: hotels[Math.floor(Math.random() * hotels.length)],
      time: "now",
    }
    setNotifications((prev) => [newNotification, ...prev].slice(0, 5))
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#f8f6f3]">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 p-6 flex items-center justify-between">
        <button 
          onClick={() => router.push("/login")}
          className="text-[#a8a298] hover:text-[#5c5650] transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>

        {/* Notification */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative text-[#8a8278] hover:text-[#4a453f] transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#6b9e78] status-available" />
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="absolute top-10 right-0 bg-white/90 backdrop-blur-lg rounded-2xl p-4 min-w-48 shadow-lg border border-[#ddd9d2] animate-fade-in">
              {/* Test notification button */}
              <button
                onClick={addTestNotification}
                className="w-full flex items-center justify-center gap-2 py-2 mb-3 text-xs text-[#7a746c] hover:text-[#4a453f] border border-dashed border-[#ccc8c0] hover:border-[#a8a298] rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>test</span>
              </button>

              {/* Notification list */}
              {notifications.length > 0 ? (
                <div className="space-y-1">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="flex items-center gap-3 py-2 px-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#6b9e78] status-available" />
                      <span className="flex-1 text-xs text-[#4a453f] font-medium">{notification.hotel}</span>
                      <span className="text-xs text-[#a8a298]">{notification.time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#a8a298] text-center py-4">empty</div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative pt-24 pb-20 px-6 max-w-md mx-auto">
        {/* Hotel list */}
        <div className="space-y-3">
          {mockHotels.map((hotel, index) => (
            <div 
              key={hotel.id} 
              className="bg-white/70 backdrop-blur-md rounded-xl p-4 shadow-sm border border-[#ddd9d2] animate-fade-in"
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              {/* Hotel row - simplified */}
              <div className="flex items-center justify-between">
                {/* Hotel name */}
                <span className="text-sm font-medium text-[#4a453f]">{hotel.name}</span>

                {/* Single breathing dot indicator */}
                <div 
                  className={`w-2 h-2 rounded-full ${
                    hotel.available 
                      ? "bg-[#6b9e78] status-available" 
                      : "bg-[#c49a8e] status-unavailable"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Legend at bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-5 text-xs text-[#8a8278]">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#6b9e78]" />
          <span>yes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#c49a8e] opacity-60" />
          <span>no</span>
        </div>
      </div>
    </div>
  )
}
