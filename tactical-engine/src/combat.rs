use crate::unit::BattleUnit;

pub struct DamageResult {
    pub damage: i32,
    pub critical: bool,
}

pub fn calculate_damage(
    attacker: &BattleUnit,
    defender: &BattleUnit,
    skill_multiplier: f64,
    terrain_defense: i32,
) -> DamageResult {
    let base_damage =
        attacker.attack as f64 * skill_multiplier - defender.defense as f64 * terrain_defense as f64 / 2.0;
    let mut damage = std::cmp::max(1, base_damage as i32);

    let critical = js_sys::Math::random() < 0.1;
    if critical {
        damage = (damage as f64 * 1.5) as i32;
    }

    let manhattan =
        (attacker.x as i32 - defender.x as i32).abs() + (attacker.y as i32 - defender.y as i32).abs();
    if manhattan == 1 {
        damage = (damage as f64 * 1.15) as i32;
    }

    DamageResult { damage, critical }
}

#[allow(dead_code)]
pub fn calculate_damage_with_allies(
    attacker: &BattleUnit,
    defender: &BattleUnit,
    skill_multiplier: f64,
    terrain_defense: i32,
    all_units: &[BattleUnit],
) -> DamageResult {
    let base_damage =
        attacker.attack as f64 * skill_multiplier - defender.defense as f64 * terrain_defense as f64 / 2.0;
    let mut damage = std::cmp::max(1, base_damage as i32);

    let critical = js_sys::Math::random() < 0.1;
    if critical {
        damage = (damage as f64 * 1.5) as i32;
    }

    let manhattan =
        (attacker.x as i32 - defender.x as i32).abs() + (attacker.y as i32 - defender.y as i32).abs();
    if manhattan == 1 {
        let has_adjacent_ally = all_units.iter().any(|u| {
            if u.id == attacker.id || u.team != attacker.team {
                return false;
            }
            let dist =
                (u.x as i32 - defender.x as i32).abs() + (u.y as i32 - defender.y as i32).abs();
            dist == 1
        });
        if has_adjacent_ally {
            damage = (damage as f64 * 1.15) as i32;
        }
    }

    DamageResult { damage, critical }
}
