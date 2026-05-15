export type UserRole = "ADMIN" | "MANAGER" | "REP"
export type ActivityType = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Contact {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  title: string | null
  source: string | null
  tags: string[]
  notes: string | null
  linkedinUrl: string | null
  website: string | null
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

export interface Stage {
  id: string
  name: string
  order: number
  color: string
  probability: number
  isDefault: boolean
}

export interface Deal {
  id: string
  title: string
  value: number
  currency: string
  stage: string
  stageId: string
  probability: number
  expectedCloseDate: Date | null
  actualCloseDate: Date | null
  contactId: string
  ownerId: string
  tags: string[]
  notes: string | null
  lostReason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Activity {
  id: string
  type: ActivityType
  subject: string
  body: string | null
  dueAt: Date | null
  completedAt: Date | null
  dealId: string | null
  contactId: string | null
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface AIInsight {
  id: string
  type: string
  payload: string
  dealId: string | null
  contactId: string | null
  userId: string
  createdAt: Date
}

export interface EmailSyncMessage {
  id: string
  messageId: string
  subject: string
  from: string
  to: string
  body: string | null
  receivedAt: Date
  syncId: string
  contactId: string | null
  createdAt: Date
}

export interface StageBreakdownItem {
  stageId: string
  stage: string
  color: string
  count: number
  value: number
}

export interface ActivityBreakdownItem {
  type: string
  count: number
}

export interface MonthlyPoint {
  month: string
  value: number
  count: number
}

export interface LeaderboardItem {
  userId: string
  name: string
  avatar: string | null
  wonValue: number
  wonCount: number
  pipelineValue: number
}

export interface AnalyticsData {
  forecastedRevenue: number
  totalPipelineValue: number
  revenueThisMonth: number
  wonThisMonth: number
  avgDealSize: number
  winRate: number
  stageBreakdown: StageBreakdownItem[]
  activityBreakdown: ActivityBreakdownItem[]
  wonByMonth: MonthlyPoint[]
  leaderboard: LeaderboardItem[]
}
