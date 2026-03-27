"use client";

import { useEffect, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { DashboardSignOut } from "./sign-out-button";
import type { ToyokoHotelRow } from "@/src/lib/toyoko/scan-toyoko-inn-seoul";
import { SendTestNotificationButton } from "./send-test-notification-button";

type NotificationItem = {
  id: number;
  hotel: string;
  time: string;
};

export function ToyokoSeoulDashboard() {
  const [hotels, setHotels] = useState<ToyokoHotelRow[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  async function loadHotels() {
    try {
      const resp = await fetch("/api/toyoko/seoul/scan", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await resp.json().catch(() => null)) as
        | {
            error?: string;
            result?: {
              hotels?: ToyokoHotelRow[];
              start?: string;
              end?: string;
            };
          }
        | null;
      if (!resp.ok) {
        throw new Error(json?.error ?? resp.statusText);
      }
      const list = json?.result?.hotels ?? [];
      setHotels(list);
    } catch {
      // b_fj UI 没有错误文案，这里保持静默
      setHotels([]);
    }
  }

  useEffect(() => {
    void loadHotels();
    const id = setInterval(() => {
      void loadHotels();
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const addTestNotification = () => {
    const names = hotels.map((h) => h.label);
    const fallback = ["大阪难波", "京都四条", "名古屋", "东京八重洲", "福冈"];
    const pool = names.length ? names : fallback;
    const newNotification: NotificationItem = {
      id: Date.now(),
      hotel: pool[Math.floor(Math.random() * pool.length)] ?? "测试",
      time: "刚刚",
    };
    setNotifications((prev) => [newNotification, ...prev].slice(0, 5));
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#f8f6f3]">
      <header className="fixed top-0 left-0 right-0 z-50 p-6 flex items-center justify-between">
        <DashboardSignOut
          className="text-[#5c5650] hover:text-[#4a453f] transition-colors p-1 rounded-lg hover:bg-black/5 disabled:opacity-50"
          aria-label="退出"
        >
          <LogOut className="w-4 h-4" />
        </DashboardSignOut>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((v) => !v)}
            className="relative text-[#5c5650] hover:text-[#4a453f] transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notifications.length > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#6b9e78] status-available" />
            ) : null}
          </button>

          {showNotifications ? (
            <div className="absolute top-10 right-0 bg-white/90 backdrop-blur-lg rounded-2xl p-4 min-w-48 shadow-lg border border-[#ddd9d2] animate-fade-in">
              <SendTestNotificationButton
                hideResult
                beforeSend={() => addTestNotification()}
                className="w-full flex items-center justify-center gap-2 py-2 mb-3 text-xs text-[#7a746c] hover:text-[#4a453f] border border-dashed border-[#ccc8c0] hover:border-[#a8a298] rounded-lg transition-colors disabled:opacity-60"
              />

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
                <div className="text-xs text-[#a8a298] text-center py-4">暂无通知</div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <main className="relative pt-24 pb-20 px-4 max-w-5xl mx-auto">
        <div className="space-y-3">
          {hotels.map((hotel, index) => (
            <a
              key={hotel.id} 
              href={hotel.url}
              target="_blank"
              rel="noreferrer"
              className="block bg-white/70 backdrop-blur-md rounded-xl p-4 shadow-sm border border-[#ddd9d2] animate-fade-in transition-colors hover:bg-white/80"
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              <div className="grid grid-cols-[0.9fr_1.2fr_1.6fr_auto] items-center gap-3">
                <span className="text-sm font-medium text-[#4a453f] text-left whitespace-nowrap">
                  东横INN
                </span>
                <span className="text-xs text-[#8a8278] text-left whitespace-nowrap">
                  {hotel.label}
                </span>
                <span className="text-xs text-[#a8a298] text-left whitespace-nowrap">
                  {hotel.date_range || "—"}
                </span>
                <div
                  className={`w-2 h-2 rounded-full justify-self-start ${
                    hotel.status === "有房"
                      ? "bg-[#6b9e78] status-available"
                      : hotel.status === "无房"
                        ? "bg-[#c49a8e] status-unavailable"
                        : "bg-[#c49a8e] status-unavailable"
                  }`}
                />
              </div>
            </a>
          ))}
        </div>
      </main>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-5 text-xs text-[#8a8278]">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#6b9e78] status-available" />
          <span>有房</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#c49a8e] status-unavailable" />
          <span>无房</span>
        </div>
      </div>
    </div>
  );
}
