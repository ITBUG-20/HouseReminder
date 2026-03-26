"use client";

import { useEffect, useState } from "react";
import { ToyokoSeoulDashboard } from "./toyoko-seoul-dashboard";

export function ClientDashboard(props: {
  userId: string;
  userEmail: string | null;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#f8f6f3]">
      <span className="sr-only">
        {props.userId}
        {props.userEmail ? ` ${props.userEmail}` : ""}
      </span>
      <ToyokoSeoulDashboard />
    </div>
  );
}

