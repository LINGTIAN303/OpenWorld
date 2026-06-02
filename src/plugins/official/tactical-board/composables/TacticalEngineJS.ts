interface JSUnit {
  id: string; name: string; team: string
  hp: number; max_hp: number; mp: number; max_mp: number
  attack: number; defense: number; speed: number
  move_range: number; attack_range: number
  skills: { id: string; name: string; mp_cost: number; multiplier: number; range: number; aoe: boolean }[]
  x: number; y: number; acted: boolean
}

interface JSTerrain {
  name: string; move_cost: number; attack_bonus: number; defense_bonus: number; blocks_move: boolean
}

const TERRAIN_MAP: Record<string, JSTerrain> = {
  plain:    { name: 'plain',    move_cost: 1, attack_bonus: 0,  defense_bonus: 0,  blocks_move: false },
  forest:   { name: 'forest',   move_cost: 2, attack_bonus: -1, defense_bonus: 2,  blocks_move: false },
  mountain: { name: 'mountain', move_cost: 3, attack_bonus: 1,  defense_bonus: 3,  blocks_move: false },
  water:    { name: 'water',    move_cost: 3, attack_bonus: -2, defense_bonus: -1, blocks_move: false },
  desert:   { name: 'desert',   move_cost: 2, attack_bonus: 0,  defense_bonus: -1, blocks_move: false },
  wall:     { name: 'wall',     move_cost: 999, attack_bonus: 0, defense_bonus: 5, blocks_move: true },
}

export class TacticalEngineJS {
  private gridType: string
  private width: number
  private height: number
  private terrainGrid: JSTerrain[][]
  private units: JSUnit[]
  private turn: number
  private phase: string

  constructor(gridType: string, width: number, height: number) {
    this.gridType = gridType
    this.width = width
    this.height = height
    this.terrainGrid = Array.from({ length: height }, () =>
      Array(width).fill(null).map(() => ({ ...TERRAIN_MAP.plain }))
    )
    this.units = []
    this.turn = 1
    this.phase = 'deployment'
  }

  place_unit(
    id: string, name: string, team: string,
    x: number, y: number,
    hp: number, max_hp: number, mp: number, max_mp: number,
    attack: number, defense: number, speed: number,
    move_range: number, attack_range: number,
  ): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      throw new Error('Position out of bounds')
    }
    if (this.units.some(u => u.x === x && u.y === y)) {
      throw new Error('Position occupied')
    }
    this.units.push({
      id, name, team, hp, max_hp, mp, max_mp,
      attack, defense, speed, move_range, attack_range,
      skills: [], x, y, acted: false,
    })
  }

  remove_unit(x: number, y: number): void {
    const idx = this.units.findIndex(u => u.x === x && u.y === y)
    if (idx === -1) throw new Error('No unit at position')
    this.units.splice(idx, 1)
  }

  move_unit(fx: number, fy: number, tx: number, ty: number): void {
    const idx = this.units.findIndex(u => u.x === fx && u.y === fy)
    if (idx === -1) throw new Error('No unit at source')
    if (fx === tx && fy === ty) {
      this.units[idx].acted = true
      return
    }
    if (this.units.some(u => u.x === tx && u.y === ty)) throw new Error('Target occupied')
    const movable = this.get_movable_range(fx, fy)
    if (!movable.some(p => p.x === tx && p.y === ty)) throw new Error('Target not in move range')
    this.units[idx].x = tx
    this.units[idx].y = ty
    this.units[idx].acted = true
  }

  get_movable_range(x: number, y: number): { x: number; y: number }[] {
    const unit = this.units.find(u => u.x === x && u.y === y)
    if (!unit) return []
    const mr = unit.move_range
    const result: { x: number; y: number }[] = []
    for (let dy = 0; dy <= mr; dy++) {
      for (let dx = 0; dx <= mr; dx++) {
        if (dx + dy > mr) continue
        const signs: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        for (const [sx, sy] of signs) {
          const nx = x + dx * sx
          const ny = y + dy * sy
          if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue
          if (nx === x && ny === y) continue
          if (this.units.some(u => u.x === nx && u.y === ny)) continue
          const terrain = this.terrainGrid[ny]?.[nx]
          if (terrain?.blocks_move) continue
          if (!result.some(p => p.x === nx && p.y === ny)) {
            result.push({ x: nx, y: ny })
          }
        }
      }
    }
    return result
  }

  get_attack_range(x: number, y: number): { x: number; y: number }[] {
    const unit = this.units.find(u => u.x === x && u.y === y)
    if (!unit) return []
    const ar = unit.attack_range
    const result: { x: number; y: number }[] = []
    for (let dy = 0; dy <= ar; dy++) {
      for (let dx = 0; dx <= ar; dx++) {
        if (dx + dy > ar) continue
        const signs: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        for (const [sx, sy] of signs) {
          const nx = x + dx * sx
          const ny = y + dy * sy
          if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue
          if (nx === x && ny === y) continue
          if (!result.some(p => p.x === nx && p.y === ny)) {
            result.push({ x: nx, y: ny })
          }
        }
      }
    }
    return result
  }

  execute_attack(ax: number, ay: number, tx: number, ty: number): Record<string, any> {
    const aIdx = this.units.findIndex(u => u.x === ax && u.y === ay)
    if (aIdx === -1) throw new Error('No attacker at position')
    const dIdx = this.units.findIndex(u => u.x === tx && u.y === ty)
    if (dIdx === -1) throw new Error('No defender at position')
    if (aIdx === dIdx) throw new Error('Cannot attack self')

    const attacker = this.units[aIdx]
    const defender = this.units[dIdx]
    const terrainDef = this.terrainGrid[ty]?.[tx]?.defense_bonus ?? 0

    const hasAlly = this.units.some(
      u => u.team === attacker.team && u.x !== attacker.x && u.y !== attacker.y &&
        Math.abs(u.x - attacker.x) <= 1 && Math.abs(u.y - attacker.y) <= 1
    )
    const allyBonus = hasAlly ? 1.15 : 1.0

    let damage = Math.max(1, Math.floor(attacker.attack * allyBonus - defender.defense * terrainDef / 2))
    let critical = false
    if (Math.random() < 0.1) {
      damage = Math.floor(damage * 1.5)
      critical = true
    }

    this.units[dIdx].hp -= damage
    if (this.units[dIdx].hp <= 0) this.units[dIdx].hp = 0
    const dead = this.units[dIdx].hp <= 0
    this.units[aIdx].acted = true

    const result = {
      damage,
      attacker_id: attacker.id,
      defender_id: defender.id,
      defender_hp_remaining: this.units[dIdx].hp,
      defender_dead: dead,
      critical,
    }

    if (dead) this.units.splice(dIdx, 1)
    return result
  }

  set_terrain(x: number, y: number, terrain_type: string): void {
    const t = TERRAIN_MAP[terrain_type]
    if (t && this.terrainGrid[y]?.[x]) {
      this.terrainGrid[y][x] = { ...t }
    }
  }

  get_unit_at(x: number, y: number): JSUnit | null {
    return this.units.find(u => u.x === x && u.y === y) || null
  }

  get_all_units(): JSUnit[] {
    return [...this.units]
  }

  get_board_info(): Record<string, any> {
    return { gridType: this.gridType, width: this.width, height: this.height }
  }

  next_turn(): void {
    this.turn++
    for (const u of this.units) u.acted = false
    this.phase = 'action'
  }

  get_turn(): number { return this.turn }
  get_phase(): string { return this.phase }

  start_battle(): void {
    this.phase = 'action'
    this.turn = 1
    for (const u of this.units) u.acted = false
  }

  check_victory(): string {
    const alive = new Set(this.units.filter(u => u.hp > 0).map(u => u.team))
    if (alive.size <= 1) return alive.values().next().value ?? ''
    return ''
  }

  ai_decide(team: string): Record<string, any> {
    const myUnits = this.units.filter(u => u.team === team && !u.acted)
    if (myUnits.length === 0) return { unit_id: '', action_type: 'wait', move_to: null, target: null, skill_id: null }

    const unit = myUnits[0]
    const enemies = this.units.filter(u => u.team !== team)
    if (enemies.length === 0) return { unit_id: unit.id, action_type: 'wait', move_to: null, target: null, skill_id: null }

    let closest = enemies[0]
    let minDist = Math.abs(enemies[0].x - unit.x) + Math.abs(enemies[0].y - unit.y)
    for (const e of enemies) {
      const d = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y)
      if (d < minDist) { minDist = d; closest = e }
    }

    const movable = this.get_movable_range(unit.x, unit.y)
    let bestMove: { x: number; y: number } | null = null
    let bestDist = minDist
    for (const m of movable) {
      const d = Math.abs(closest.x - m.x) + Math.abs(closest.y - m.y)
      if (d < bestDist) { bestDist = d; bestMove = m }
    }

    const attackRange = this.get_attack_range(unit.x, unit.y)
    const inRange = attackRange.some(p => p.x === closest.x && p.y === closest.y)

    if (inRange) {
      return { unit_id: unit.id, action_type: 'attack', move_to: null, target: { x: closest.x, y: closest.y }, skill_id: null }
    }

    if (bestMove) {
      return { unit_id: unit.id, action_type: 'move', move_to: bestMove, target: null, skill_id: null }
    }

    return { unit_id: unit.id, action_type: 'wait', move_to: null, target: null, skill_id: null }
  }

  calculate_awareness(): Record<string, any> {
    const cells: Record<string, any>[] = []
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        const unitsNear = this.units.filter(u => Math.abs(u.x - c) <= 3 && Math.abs(u.y - r) <= 3)
        const teamCounts: Record<string, number> = {}
        for (const u of unitsNear) {
          teamCounts[u.team] = (teamCounts[u.team] || 0) + 1
        }
        let controllingTeam: string | null = null
        let maxCount = 0
        for (const [team, count] of Object.entries(teamCounts)) {
          if (count > maxCount) { maxCount = count; controllingTeam = team }
        }
        const threatLevel = controllingTeam
          ? unitsNear.filter(u => u.team !== controllingTeam).length * 0.2
          : 0
        const hasFriendly = this.units.some(u => u.team === 'ally' && Math.abs(u.x - c) <= 2 && Math.abs(u.y - r) <= 2)
        const hasEnemy = this.units.some(u => u.team === 'enemy' && Math.abs(u.x - c) <= 2 && Math.abs(u.y - r) <= 2)
        cells.push({
          x: c, y: r,
          controlling_team: controllingTeam,
          threat_level: threatLevel,
          is_supply_line: hasFriendly && !hasEnemy,
          is_isolated: hasFriendly && unitsNear.filter(u => u.team === 'ally').length === 1,
        })
      }
    }
    return { cells }
  }
}
