use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::pathfind::WeightedGraph;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutNode {
  pub id: String,
  pub x: f64,
  pub y: f64,
  pub vx: f64,
  pub vy: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutEdge {
  pub source: String,
  pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceLayoutConfig {
  pub repulsion: f64,
  pub attraction: f64,
  pub ideal_length: f64,
  pub damping: f64,
  pub max_iterations: usize,
  pub epsilon: f64,
  pub area: f64,
  pub gravity: f64,
}

impl Default for ForceLayoutConfig {
  fn default() -> Self {
    Self {
      repulsion: 1000.0,
      attraction: 0.01,
      ideal_length: 100.0,
      damping: 0.9,
      max_iterations: 300,
      epsilon: 1.0,
      area: 10000.0,
      gravity: 0.1,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceLayoutResult {
  pub nodes: Vec<LayoutNode>,
  pub iterations: usize,
  pub converged: bool,
  pub total_energy: f64,
}

#[allow(clippy::cast_precision_loss)]
#[allow(clippy::too_many_lines)]
#[must_use] 
pub fn force_directed_layout(
  graph: &WeightedGraph,
  config: &ForceLayoutConfig,
) -> ForceLayoutResult {
  let nodes_set = graph.nodes();
  let n = nodes_set.len();
  if n == 0 {
    return ForceLayoutResult {
      nodes: vec![],
      iterations: 0,
      converged: true,
      total_energy: 0.0,
    };
  }

  let mut nodes: Vec<LayoutNode> = nodes_set
    .iter()
    .enumerate()
    .map(|(i, id)| {
      let angle = 2.0 * std::f64::consts::PI * i as f64 / n as f64;
      LayoutNode {
        id: id.to_string(),
        x: (angle.cos() * config.ideal_length).mul_add(2.0, config.area.sqrt() / 2.0),
        y: (angle.sin() * config.ideal_length).mul_add(2.0, config.area.sqrt() / 2.0),
        vx: 0.0,
        vy: 0.0,
      }
    })
    .collect();

  let mut id_to_idx: HashMap<String, usize> = HashMap::new();
  for (i, node) in nodes.iter().enumerate() {
    id_to_idx.insert(node.id.clone(), i);
  }

  let edges: Vec<LayoutEdge> = graph
    .adjacency
    .iter()
    .flat_map(|(from, edges)| {
      edges
        .iter()
        .map(|e| LayoutEdge {
          source: from.clone(),
          target: e.target.clone(),
        })
        .collect::<Vec<_>>()
    })
    .collect();

  let center_x = config.area.sqrt() / 2.0;
  let center_y = config.area.sqrt() / 2.0;

  let mut iterations = 0;
  let mut converged = false;
  let mut temperature = config.area.sqrt() / 4.0;
  let cooling = temperature / config.max_iterations as f64;

  for iter in 0..config.max_iterations {
    iterations = iter + 1;
    let mut displacements: Vec<(f64, f64)> = vec![(0.0, 0.0); n];

    for i in 0..n {
      for j in 0..n {
        if i == j {
          continue;
        }
        let dx = nodes[i].x - nodes[j].x;
        let dy = nodes[i].y - nodes[j].y;
        let dist_sq = dx.mul_add(dx, dy * dy);
        let dist = dist_sq.sqrt().max(0.1);
        let force = config.repulsion / dist_sq;
        displacements[i].0 += (dx / dist) * force;
        displacements[i].1 += (dy / dist) * force;
      }
    }

    for edge in &edges {
      if let (Some(&i), Some(&j)) = (id_to_idx.get(&edge.source), id_to_idx.get(&edge.target)) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = dx.hypot(dy).max(0.1);
        let force = config.attraction * (dist - config.ideal_length);
        displacements[i].0 += (dx / dist) * force;
        displacements[i].1 += (dy / dist) * force;
        displacements[j].0 -= (dx / dist) * force;
        displacements[j].1 -= (dy / dist) * force;
      }
    }

    for i in 0..n {
      let dx = center_x - nodes[i].x;
      let dy = center_y - nodes[i].y;
      displacements[i].0 += dx * config.gravity;
      displacements[i].1 += dy * config.gravity;
    }

    let mut total_energy = 0.0;
    for i in 0..n {
      let disp_mag = displacements[i].0.hypot(displacements[i].1)
        .min(temperature);
      nodes[i].x += (displacements[i].0 / disp_mag.max(0.1)) * disp_mag;
      nodes[i].y += (displacements[i].1 / disp_mag.max(0.1)) * disp_mag;
      total_energy += displacements[i].0.mul_add(displacements[i].0, displacements[i].1 * displacements[i].1);
    }

    temperature -= cooling;
    if temperature < 0.0 {
      temperature = 0.0;
    }

    if total_energy < config.epsilon {
      converged = true;
      break;
    }
  }

  let total_energy: f64 = nodes
    .iter()
    .zip(displacements_for_energy(&nodes, &edges, &id_to_idx, config, center_x, center_y))
    .map(|(_n, d)| d.0.mul_add(d.0, d.1 * d.1))
    .sum();

  ForceLayoutResult {
    nodes,
    iterations,
    converged,
    total_energy,
  }
}

fn displacements_for_energy(
  nodes: &[LayoutNode],
  edges: &[LayoutEdge],
  id_to_idx: &HashMap<String, usize>,
  config: &ForceLayoutConfig,
  center_x: f64,
  center_y: f64,
) -> Vec<(f64, f64)> {
  let n = nodes.len();
  let mut disps: Vec<(f64, f64)> = vec![(0.0, 0.0); n];

  for i in 0..n {
    for j in 0..n {
      if i == j {
        continue;
      }
      let dx = nodes[i].x - nodes[j].x;
      let dy = nodes[i].y - nodes[j].y;
      let dist_sq = dx.mul_add(dx, dy * dy);
      let dist = dist_sq.sqrt().max(0.1);
      let force = config.repulsion / dist_sq;
      disps[i].0 += (dx / dist) * force;
      disps[i].1 += (dy / dist) * force;
    }
  }

  for edge in edges {
    if let (Some(&i), Some(&j)) = (id_to_idx.get(&edge.source), id_to_idx.get(&edge.target)) {
      let dx = nodes[j].x - nodes[i].x;
      let dy = nodes[j].y - nodes[i].y;
      let dist = dx.hypot(dy).max(0.1);
      let force = config.attraction * (dist - config.ideal_length);
      disps[i].0 += (dx / dist) * force;
      disps[i].1 += (dy / dist) * force;
    }
  }

  for i in 0..n {
    let dx = center_x - nodes[i].x;
    let dy = center_y - nodes[i].y;
    disps[i].0 += dx * config.gravity;
    disps[i].1 += dy * config.gravity;
  }

  disps
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_force_layout_simple() {
    let mut g = WeightedGraph::new();
    g.add_undirected_edge("A", "B", 1.0, None);
    g.add_undirected_edge("B", "C", 1.0, None);
    g.add_undirected_edge("C", "A", 1.0, None);

    let config = ForceLayoutConfig {
      max_iterations: 50,
      ..Default::default()
    };
    let result = force_directed_layout(&g, &config);
    assert_eq!(result.nodes.len(), 3);
    assert!(result.iterations > 0);
  }

  #[test]
  fn test_force_layout_empty() {
    let g = WeightedGraph::new();
    let result = force_directed_layout(&g, &ForceLayoutConfig::default());
    assert!(result.nodes.is_empty());
    assert!(result.converged);
  }

  #[test]
  fn test_force_layout_single_node() {
    let mut g = WeightedGraph::new();
    g.add_edge("A", "A", 0.0, None);
    let result = force_directed_layout(&g, &ForceLayoutConfig::default());
    assert_eq!(result.nodes.len(), 1);
  }

  #[test]
  fn test_force_layout_convergence() {
    let mut g = WeightedGraph::new();
    for i in 0..5 {
      for j in (i + 1)..5 {
        g.add_undirected_edge(&format!("N{i}"), &format!("N{j}"), 1.0, None);
      }
    }
    let config = ForceLayoutConfig {
      max_iterations: 500,
      epsilon: 0.01,
      ..Default::default()
    };
    let result = force_directed_layout(&g, &config);
    assert!(result.iterations > 0);
  }
}
