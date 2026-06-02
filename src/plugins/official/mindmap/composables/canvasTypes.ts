export interface CanvasNode {
  id: string
  name: string
  type: string
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null
  fy: number | null
  width: number
  height: number
  color: string
  icon: string
  label: string
  tags: string[]
  description: string
  degree: number
  customColor: string
  isRoot: boolean
  isCollapsed: boolean
  childCount: number
  centerStyle: string
  textboxSize: string
  textboxStyle: string
  imageUrl: string
  linkUrl: string
  hidden: boolean
  selected: boolean
  highlighted: boolean
  searchHighlight: boolean
  sectionColor: string
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  relType: string
  relLabel: string
  bidirectional: boolean
  symmetric: boolean
  color: string
  curveStyle: 'bezier' | 'straight' | 'taxi'
  dashed: boolean
  noArrow: boolean
  hidden: boolean
  selected: boolean
}

export interface CameraState {
  x: number
  y: number
  k: number
}
