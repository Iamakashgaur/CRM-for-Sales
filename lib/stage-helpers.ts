import { prisma } from "./prisma"

export interface ClosedStageInfo {
  wonId?: string
  lostId?: string
  wonName?: string
  lostName?: string
  closedNames: string[]
}

export async function getClosedStageIds(): Promise<ClosedStageInfo> {
  const stages = await prisma.stage.findMany()
  const won =
    stages.find((s) => s.probability === 100) ??
    stages.find((s) => s.name.toLowerCase().includes("won"))
  const lost =
    stages.find((s) => s.probability === 0) ??
    stages.find((s) => s.name.toLowerCase().includes("lost"))
  const closedNames = stages
    .filter((s) => isClosedStage(s.name))
    .map((s) => s.name)
  return {
    wonId: won?.id,
    lostId: lost?.id,
    wonName: won?.name,
    lostName: lost?.name,
    closedNames,
  }
}

export function isClosedStage(stageName: string): boolean {
  const n = stageName.toLowerCase()
  return n.includes("won") || n.includes("lost") || n.includes("closed")
}

export function isWonStageName(stageName: string): boolean {
  return stageName.toLowerCase().includes("won")
}

export function isLostStageName(stageName: string): boolean {
  return stageName.toLowerCase().includes("lost")
}

export function isLostStage(stageName: string): boolean {
  return stageName.toLowerCase().includes("lost")
}
