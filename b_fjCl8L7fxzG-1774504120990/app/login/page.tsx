"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [focused, setFocused] = useState<string | null>(null)
  const [isRegister, setIsRegister] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#f8f6f3]">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#5c5650]/5 rounded-full blur-3xl" />

      {/* Glass card */}
      <div className="relative glass rounded-3xl p-12 w-full max-w-sm animate-fade-in">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email field */}
          <div className="relative">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              className="w-full bg-transparent border-0 border-b border-[#c5c0b8] rounded-none px-0 py-3 text-[#4a453f] placeholder:text-[#a8a298] focus:ring-0 focus:border-[#7a746c] transition-colors"
              placeholder="email"
            />
            <div 
              className={`absolute bottom-0 left-0 h-px bg-[#5c5650] transition-all duration-500 ${
                focused === "email" ? "w-full" : "w-0"
              }`} 
            />
          </div>

          {/* Password field */}
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              className="w-full bg-transparent border-0 border-b border-[#c5c0b8] rounded-none px-0 py-3 pr-10 text-[#4a453f] placeholder:text-[#a8a298] focus:ring-0 focus:border-[#7a746c] transition-colors"
              placeholder="password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#a8a298] hover:text-[#5c5650] transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <div 
              className={`absolute bottom-0 left-0 h-px bg-[#5c5650] transition-all duration-500 ${
                focused === "password" ? "w-full" : "w-0"
              }`} 
            />
          </div>

          {/* Confirm password field - only show in register mode */}
          {isRegister && (
            <div className="relative animate-fade-in">
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocused("confirm")}
                onBlur={() => setFocused(null)}
                className="w-full bg-transparent border-0 border-b border-[#c5c0b8] rounded-none px-0 py-3 text-[#4a453f] placeholder:text-[#a8a298] focus:ring-0 focus:border-[#7a746c] transition-colors"
                placeholder="confirm"
              />
              <div 
                className={`absolute bottom-0 left-0 h-px bg-[#5c5650] transition-all duration-500 ${
                  focused === "confirm" ? "w-full" : "w-0"
                }`} 
              />
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="w-full py-4 mt-6 text-[#5c5650] hover:text-[#4a453f] text-sm tracking-[0.2em] uppercase transition-colors duration-300"
          >
            {isRegister ? "register" : "enter"}
          </button>

          {/* Toggle login/register */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-xs text-[#a8a298] hover:text-[#7a746c] tracking-wide transition-colors"
            >
              {isRegister ? "have account? login" : "no account? register"}
            </button>
          </div>
        </form>
      </div>

      {/* Back hint */}
      <button 
        onClick={() => router.push("/")}
        className="absolute top-8 left-8 text-[#c5c0b8] hover:text-[#8a8278] transition-colors text-xs tracking-[0.2em]"
      >
        back
      </button>
    </div>
  )
}
