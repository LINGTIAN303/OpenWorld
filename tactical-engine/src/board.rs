use crate::terrain;

pub struct Board {
    pub grid_type: String,
    pub width: u32,
    pub height: u32,
    terrain: Vec<Vec<String>>,
}

impl Board {
    pub fn new(grid_type: &str, width: u32, height: u32) -> Self {
        let terrain = vec![vec!["plain".to_string(); width as usize]; height as usize];
        Self {
            grid_type: grid_type.to_string(),
            width,
            height,
            terrain,
        }
    }

    pub fn get_terrain(&self, x: u32, y: u32) -> terrain::TerrainType {
        let name = self
            .terrain
            .get(y as usize)
            .and_then(|row| row.get(x as usize))
            .map(|s| s.as_str())
            .unwrap_or("plain");
        terrain::get_terrain_type(name)
    }

    pub fn set_terrain(&mut self, x: u32, y: u32, terrain_type: &str) {
        if let Some(row) = self.terrain.get_mut(y as usize) {
            if let Some(cell) = row.get_mut(x as usize) {
                *cell = terrain_type.to_string();
            }
        }
    }
}
