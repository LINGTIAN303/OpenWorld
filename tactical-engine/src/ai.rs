use crate::{AiAction, Position, TacticalEngine};

fn manhattan(x1: u32, y1: u32, x2: u32, y2: u32) -> u32 {
    (x1 as i32 - x2 as i32).unsigned_abs() + (y1 as i32 - y2 as i32).unsigned_abs()
}

pub fn decide(engine: &TacticalEngine, team: &str) -> AiAction {
    let unit = match engine.units.iter().find(|u| u.team == team && !u.acted) {
        Some(u) => u,
        None => {
            return AiAction {
                unit_id: String::new(),
                action_type: "wait".to_string(),
                move_to: None,
                target: None,
                skill_id: None,
            }
        }
    };

    let unit_id = unit.id.clone();
    let ux = unit.x;
    let uy = unit.y;
    let attack_range = unit.attack_range;

    let nearest_enemy = engine
        .units
        .iter()
        .filter(|u| u.team != team)
        .min_by_key(|u| manhattan(ux, uy, u.x, u.y));

    let enemy = match nearest_enemy {
        Some(e) => e,
        None => {
            return AiAction {
                unit_id,
                action_type: "wait".to_string(),
                move_to: None,
                target: None,
                skill_id: None,
            }
        }
    };

    let dist = manhattan(ux, uy, enemy.x, enemy.y);

    if dist <= attack_range {
        return AiAction {
            unit_id,
            action_type: "attack".to_string(),
            move_to: None,
            target: Some(Position {
                x: enemy.x,
                y: enemy.y,
            }),
            skill_id: None,
        };
    }

    let movable = engine.get_movable_range(ux, uy);
    if let Some(best) = movable
        .iter()
        .min_by_key(|p| manhattan(p.x, p.y, enemy.x, enemy.y))
    {
        return AiAction {
            unit_id,
            action_type: "move".to_string(),
            move_to: Some(Position {
                x: best.x,
                y: best.y,
            }),
            target: None,
            skill_id: None,
        };
    }

    AiAction {
        unit_id,
        action_type: "wait".to_string(),
        move_to: None,
        target: None,
        skill_id: None,
    }
}
