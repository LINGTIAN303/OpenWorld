mod board;
mod unit;
mod combat;
mod terrain;
mod ai;
mod awareness;

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Position {
    pub x: u32,
    pub y: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CombatResult {
    pub damage: i32,
    pub attacker_id: String,
    pub defender_id: String,
    pub defender_hp_remaining: i32,
    pub defender_dead: bool,
    pub critical: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AiAction {
    pub unit_id: String,
    pub action_type: String,
    pub move_to: Option<Position>,
    pub target: Option<Position>,
    pub skill_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AwarenessCell {
    pub x: u32,
    pub y: u32,
    pub controlling_team: Option<String>,
    pub threat_level: f64,
    pub is_supply_line: bool,
    pub is_isolated: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AwarenessResult {
    pub cells: Vec<AwarenessCell>,
}

#[wasm_bindgen]
pub struct TacticalEngine {
    pub(crate) board: board::Board,
    pub(crate) units: Vec<unit::BattleUnit>,
    pub(crate) turn: u32,
    pub(crate) phase: String,
}

#[wasm_bindgen]
impl TacticalEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(grid_type: &str, width: u32, height: u32) -> Self {
        Self {
            board: board::Board::new(grid_type, width, height),
            units: Vec::new(),
            turn: 1,
            phase: "deployment".to_string(),
        }
    }

    pub fn place_unit(&mut self, id: &str, name: &str, team: &str, x: u32, y: u32, hp: i32, max_hp: i32, mp: i32, max_mp: i32, attack: i32, defense: i32, speed: i32, move_range: u32, attack_range: u32) -> Result<(), JsValue> {
        if x >= self.board.width || y >= self.board.height {
            return Err(JsValue::from_str("Position out of bounds"));
        }
        if self.units.iter().any(|u| u.x == x && u.y == y) {
            return Err(JsValue::from_str("Position occupied"));
        }
        self.units.push(unit::BattleUnit {
            id: id.to_string(),
            name: name.to_string(),
            team: team.to_string(),
            hp, max_hp, mp, max_mp,
            attack, defense, speed,
            move_range, attack_range,
            skills: Vec::new(),
            x, y,
            acted: false,
        });
        Ok(())
    }

    pub fn remove_unit(&mut self, x: u32, y: u32) -> Result<(), JsValue> {
        let idx = self.units.iter().position(|u| u.x == x && u.y == y)
            .ok_or_else(|| JsValue::from_str("No unit at position"))?;
        self.units.remove(idx);
        Ok(())
    }

    pub fn move_unit(&mut self, fx: u32, fy: u32, tx: u32, ty: u32) -> Result<(), JsValue> {
        let idx = self.units.iter().position(|u| u.x == fx && u.y == fy)
            .ok_or_else(|| JsValue::from_str("No unit at source"))?;
        if self.units.iter().any(|u| u.x == tx && u.y == ty) {
            return Err(JsValue::from_str("Target occupied"));
        }
        let movable = self.get_movable_range(fx, fy);
        if !movable.iter().any(|p| p.x == tx && p.y == ty) {
            return Err(JsValue::from_str("Target not in move range"));
        }
        self.units[idx].x = tx;
        self.units[idx].y = ty;
        self.units[idx].acted = true;
        Ok(())
    }

    pub fn get_movable_range(&self, x: u32, y: u32) -> Vec<Position> {
        let unit = match self.units.iter().find(|u| u.x == x && u.y == y) {
            Some(u) => u,
            None => return Vec::new(),
        };
        let mr = unit.move_range;
        let mut result = Vec::new();
        for dy in 0..=mr {
            for dx in 0..=mr {
                if dx + dy > mr { continue; }
                for &(sx, sy) in &[(1i32, 1i32), (1, -1), (-1, 1), (-1, -1)] {
                    let nx = x as i32 + dx as i32 * sx;
                    let ny = y as i32 + dy as i32 * sy;
                    if nx < 0 || ny < 0 { continue; }
                    let nx = nx as u32;
                    let ny = ny as u32;
                    if nx >= self.board.width || ny >= self.board.height { continue; }
                    if nx == x && ny == y { continue; }
                    if self.units.iter().any(|u| u.x == nx && u.y == ny) { continue; }
                    let terrain = self.board.get_terrain(nx, ny);
                    if terrain.blocks_movement() { continue; }
                    result.push(Position { x: nx, y: ny });
                }
            }
        }
        result
    }

    pub fn get_attack_range(&self, x: u32, y: u32) -> Vec<Position> {
        let unit = match self.units.iter().find(|u| u.x == x && u.y == y) {
            Some(u) => u,
            None => return Vec::new(),
        };
        let ar = unit.attack_range;
        let mut result = Vec::new();
        for dy in 0..=ar {
            for dx in 0..=ar {
                if dx + dy > ar { continue; }
                for &(sx, sy) in &[(1i32, 1i32), (1, -1), (-1, 1), (-1, -1)] {
                    let nx = x as i32 + dx as i32 * sx;
                    let ny = y as i32 + dy as i32 * sy;
                    if nx < 0 || ny < 0 { continue; }
                    let nx = nx as u32;
                    let ny = ny as u32;
                    if nx >= self.board.width || ny >= self.board.height { continue; }
                    if nx == x && ny == y { continue; }
                    result.push(Position { x: nx, y: ny });
                }
            }
        }
        result
    }

    pub fn execute_attack(&mut self, ax: u32, ay: u32, tx: u32, ty: u32) -> Result<JsValue, JsValue> {
        let attacker_idx = self.units.iter().position(|u| u.x == ax && u.y == ay)
            .ok_or_else(|| JsValue::from_str("No attacker at position"))?;
        let defender_idx = self.units.iter().position(|u| u.x == tx && u.y == ty)
            .ok_or_else(|| JsValue::from_str("No defender at position"))?;

        if attacker_idx == defender_idx {
            return Err(JsValue::from_str("Cannot attack self"));
        }

        let terrain_def = self.board.get_terrain(tx, ty).defense_bonus;
        let result = combat::calculate_damage(
            &self.units[attacker_idx],
            &self.units[defender_idx],
            1.0,
            terrain_def,
        );

        self.units[defender_idx].hp -= result.damage;
        if self.units[defender_idx].hp <= 0 {
            self.units[defender_idx].hp = 0;
        }
        let dead = self.units[defender_idx].hp <= 0;
        self.units[attacker_idx].acted = true;

        let combat_result = CombatResult {
            damage: result.damage,
            attacker_id: self.units[attacker_idx].id.clone(),
            defender_id: self.units[defender_idx].id.clone(),
            defender_hp_remaining: self.units[defender_idx].hp,
            defender_dead: dead,
            critical: result.critical,
        };

        if dead {
            self.units.remove(defender_idx);
        }

        serde_wasm_bindgen::to_value(&combat_result).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn ai_decide(&self, team: &str) -> Result<JsValue, JsValue> {
        let action = ai::decide(self, team);
        serde_wasm_bindgen::to_value(&action).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn calculate_awareness(&self) -> Result<JsValue, JsValue> {
        let result = awareness::calculate(self);
        serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn set_terrain(&mut self, x: u32, y: u32, terrain_type: &str) {
        self.board.set_terrain(x, y, terrain_type);
    }

    pub fn get_unit_at(&self, x: u32, y: u32) -> Result<JsValue, JsValue> {
        match self.units.iter().find(|u| u.x == x && u.y == y) {
            Some(u) => serde_wasm_bindgen::to_value(u).map_err(|e| JsValue::from_str(&e.to_string())),
            None => Ok(JsValue::NULL),
        }
    }

    pub fn get_all_units(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.units).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn get_board_info(&self) -> Result<JsValue, JsValue> {
        let info = serde_json::json!({
            "gridType": self.board.grid_type,
            "width": self.board.width,
            "height": self.board.height,
        });
        Ok(JsValue::from_str(&info.to_string()))
    }

    pub fn next_turn(&mut self) {
        self.turn += 1;
        for u in &mut self.units {
            u.acted = false;
        }
        self.phase = "action".to_string();
    }

    pub fn get_turn(&self) -> u32 {
        self.turn
    }

    pub fn get_phase(&self) -> String {
        self.phase.clone()
    }

    pub fn start_battle(&mut self) {
        self.phase = "action".to_string();
        self.turn = 1;
        for u in &mut self.units {
            u.acted = false;
        }
    }

    pub fn check_victory(&self) -> Result<JsValue, JsValue> {
        let alive_teams: std::collections::HashSet<_> = self.units.iter()
            .filter(|u| u.hp > 0)
            .map(|u| u.team.clone())
            .collect();
        let result = if alive_teams.len() <= 1 {
            alive_teams.iter().next().map(|t| t.clone()).unwrap_or_default()
        } else {
            String::new()
        };
        Ok(JsValue::from_str(&result))
    }
}
