"use client"

import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()

  return (
    <div 
      className="min-h-screen flex items-center justify-center cursor-pointer relative overflow-hidden bg-[#f8f6f3]"
      onClick={() => router.push("/login")}
    >
      
      {/* Floating particles - 虚无中的微光 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-foreground/10 animate-float"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${5 + i}s`,
            }}
          />
        ))}
      </div>

      {/* Center breathing dot - 有生于无 */}
      <div className="relative flex items-center justify-center">
        {/* Pulse rings - 涟漪扩散 */}
        <div className="absolute w-6 h-6 rounded-full bg-foreground/20 animate-pulse-ring" />
        <div 
          className="absolute w-6 h-6 rounded-full bg-foreground/20 animate-pulse-ring" 
          style={{ animationDelay: "0.6s" }}
        />
        <div 
          className="absolute w-6 h-6 rounded-full bg-foreground/20 animate-pulse-ring" 
          style={{ animationDelay: "1.2s" }}
        />
        
        {/* Main dot - 生命之源 */}
        <div className="relative w-4 h-4 rounded-full bg-foreground animate-breathe shadow-[0_0_20px_rgba(80,70,60,0.2)]" />
      </div>

      {/* Hint text - only visible on hover */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity duration-1000">
        <p className="text-muted-foreground/50 text-xs tracking-[0.3em]">ENTER</p>
      </div>
    </div>
  )
}
