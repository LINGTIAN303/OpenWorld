# 算法目录

## 图算法

### algo_shortest_path
- 输入: 邻接表 + 起点 + 终点
- 输出: 最短路径节点序列 + 总权重
- 用途: 角色间关系路径、地理距离计算

### algo_k_shortest_paths
- 输入: 邻接表 + 起点 + 终点 + k
- 输出: 前 k 条最短路径
- 用途: 备选路线规划

### algo_topological_sort
- 输入: 有向图邻接表
- 输出: 拓扑排序序列
- 用途: 事件时间线排序、依赖分析

### algo_graph_analysis
- 输入: 邻接表
- 输出: 连通分量、度分布、中心性指标
- 用途: 社交网络分析、势力影响力评估

### algo_force_layout
- 输入: 图结构 + 迭代参数
- 输出: 节点坐标
- 用途: 关系网络可视化布局

### algo_pagerank
- 输入: 有向图 + 阻尼系数
- 输出: 节点重要性排名
- 用途: 实体重要性评估

### algo_community_detection
- 输入: 图结构
- 输出: 社区划分
- 用途: 势力阵营自动发现

## 几何算法

### algo_spatial_insert / query / clear
- 空间索引管理，用于高效空间查询

### algo_polygon_boolean
- 多边形布尔运算（并/交/差/异或）
- 输入: 两个多边形 + 运算类型
- 输出: 结果多边形

### algo_convex_hull
- 凸包计算
- 输入: 点集
- 输出: 凸包多边形

## 地形算法

### algo_terrain_noise
- Perlin/Simplex 噪声地形生成
- 参数: scale, octaves, persistence, seed

### algo_terrain_heightmap
- 高度图生成
- 参数: width, height, noise_params

### algo_hydraulic_erosion
- 水力侵蚀模拟
- 参数: iterations, droplet_lifetime, erosion_rate

### algo_viewshed
- 视域分析
- 参数: viewpoint, max_distance, resolution
