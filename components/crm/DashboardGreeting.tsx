"use client"

import * as React from "react"

function greetingFromHour(h: number): string {
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

interface Props {
  name: string
  workspace?: string
}

export function DashboardGreeting({ name, workspace }: Props) {
  const [greeting, setGreeting] = React.useState("Hi")
  const [today, setToday] = React.useState("")

  React.useEffect(() => {
    const now = new Date()
    setGreeting(greetingFromHour(now.getHours()))
    setToday(
      now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    )
  }, [])

  const trimmed = (name ?? "").trim()
  const firstName = trimmed ? trimmed.split(" ")[0] : "there"

  return (
    <div>
      <h1 className="text-3xl md:text-4xl font-medium tracking-[-0.025em] leading-tight">
        <span className="text-muted-foreground">{greeting}, </span>
        <span className="text-foreground">{firstName}</span>
      </h1>
      <p className="text-[13px] text-muted-foreground mt-2">
        {today}
        {workspace && <span className="mx-1.5 text-muted-foreground/50">·</span>}
        {workspace && <span>{workspace}</span>}
      </p>
    </div>
  )
}
