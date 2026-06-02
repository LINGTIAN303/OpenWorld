//! 内置节点的元数据 + configSchema
//!
//! Phase 3.1 起点：定义 14 个 builtin 节点的 `NodeMetadata`，让 `workflow_list_node_types` /
//! `workflow_get_node_schema` 命令把元数据返回给前端（前端用来画调色板 + 自动生成表单）。
//!
//! 字段与 TS 端 [NodeMetadata](file:///d:/%E6%9C%AC%E5%9C%B0%E5%8C%96AI/DeepSeek_Home/worldsmith/worldsmith-agent/src/workflow/types.ts) 1:1 对应。

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeCategory {
    Builtin,
    Plugin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfigFieldSchema {
    #[serde(rename = "type")]
    pub field_type: String, // "string" | "number" | "boolean"
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub default: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub options: Option<Vec<String>>,
    /// Phase 4.6: UI 显示标签（plugin 端 NodeConfigFieldSchema 含 `label` 字段）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub label: Option<String>,
}

impl NodeConfigFieldSchema {
    pub fn string(desc: &str) -> Self {
        Self {
            field_type: "string".to_string(),
            required: None,
            default: None,
            description: Some(desc.to_string()),
            options: None,
            label: None,
        }
    }
    pub fn string_required(desc: &str) -> Self {
        Self {
            field_type: "string".to_string(),
            required: Some(true),
            default: None,
            description: Some(desc.to_string()),
            options: None,
            label: None,
        }
    }
    pub fn string_with_options(desc: &str, options: &[&str]) -> Self {
        Self {
            field_type: "string".to_string(),
            required: None,
            default: None,
            description: Some(desc.to_string()),
            options: Some(options.iter().map(|s| s.to_string()).collect()),
            label: None,
        }
    }
    pub fn number(desc: &str, default: Option<f64>) -> Self {
        Self {
            field_type: "number".to_string(),
            required: None,
            default: default.map(|d| serde_json::json!(d)),
            description: Some(desc.to_string()),
            options: None,
            label: None,
        }
    }
    pub fn boolean(desc: &str, default: bool) -> Self {
        Self {
            field_type: "boolean".to_string(),
            required: None,
            default: Some(serde_json::json!(default)),
            description: Some(desc.to_string()),
            options: None,
            label: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeMetadata {
    pub r#type: String,
    pub category: NodeCategory,
    pub label: String,
    pub icon: String,
    pub color: String,
    pub plugin_id: String,
    pub description: String,
    /// 节点 config 的字段 schema（key = 字段名）
    pub config_schema: BTreeMap<String, NodeConfigFieldSchema>,
}

// ─────────────────────────────────────────────────────────────────────────────
// 14 个 builtin 节点元数据
// ─────────────────────────────────────────────────────────────────────────────

/// 14 个 builtin 节点的元数据列表。
/// 与 [handlers/builtin.ts](file:///d:/%E6%9C%AC%E5%9C%B0%E5%8C%96AI/DeepSeek_Home/worldsmith/worldsmith-agent/src/workflow/handlers/builtin.ts) 1:1 对齐。
pub fn builtin_node_metadata() -> Vec<NodeMetadata> {
    vec![
        // 1. start
        NodeMetadata {
            r#type: "start".to_string(),
            category: NodeCategory::Builtin,
            label: "开始".to_string(),
            icon: "play".to_string(),
            color: "#22c55e".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "工作流入口节点；定义初始 params".to_string(),
            config_schema: BTreeMap::new(),
        },
        // 2. end
        NodeMetadata {
            r#type: "end".to_string(),
            category: NodeCategory::Builtin,
            label: "结束".to_string(),
            icon: "stop".to_string(),
            color: "#ef4444".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "工作流出口节点；汇总最终结果".to_string(),
            config_schema: BTreeMap::new(),
        },
        // 3. skill
        NodeMetadata {
            r#type: "skill".to_string(),
            category: NodeCategory::Builtin,
            label: "Skill".to_string(),
            icon: "sparkles".to_string(),
            color: "#8b5cf6".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "调用注册的 Skill 节点（来自 plugin 的可重用能力）".to_string(),
            config_schema: BTreeMap::from([
                ("skill_id".to_string(), NodeConfigFieldSchema::string_required("Skill 类型 id（如 'greet.skill'）")),
                ("prompt".to_string(), NodeConfigFieldSchema::string("传给 Skill 的提示词")),
            ]),
        },
        // 4. tool
        NodeMetadata {
            r#type: "tool".to_string(),
            category: NodeCategory::Builtin,
            label: "Tool".to_string(),
            icon: "wrench".to_string(),
            color: "#0ea5e9".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "调用注册的工具（如 HTTP/数据库/Shell）".to_string(),
            config_schema: BTreeMap::from([
                ("tool_name".to_string(), NodeConfigFieldSchema::string_required("工具名")),
                ("args".to_string(), NodeConfigFieldSchema::string("JSON 字符串或模板")),
            ]),
        },
        // 5. sub_agent
        NodeMetadata {
            r#type: "sub_agent".to_string(),
            category: NodeCategory::Builtin,
            label: "子代理".to_string(),
            icon: "users".to_string(),
            color: "#a855f7".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "派生子 Agent 执行子任务（递归）".to_string(),
            config_schema: BTreeMap::from([
                ("agent_type".to_string(), NodeConfigFieldSchema::string_required("子代理类型")),
                ("prompt".to_string(), NodeConfigFieldSchema::string("任务提示词")),
            ]),
        },
        // 6. condition
        NodeMetadata {
            r#type: "condition".to_string(),
            category: NodeCategory::Builtin,
            label: "条件分支".to_string(),
            icon: "git-branch".to_string(),
            color: "#f59e0b".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "基于表达式的条件分支（if/elif/else）".to_string(),
            config_schema: BTreeMap::from([
                ("expression".to_string(), NodeConfigFieldSchema::string_required("条件表达式")),
                ("branches".to_string(), NodeConfigFieldSchema::string("JSON: [{condition, target}]")),
            ]),
        },
        // 7. agent_decision
        NodeMetadata {
            r#type: "agent_decision".to_string(),
            category: NodeCategory::Builtin,
            label: "代理决策".to_string(),
            icon: "brain".to_string(),
            color: "#ec4899".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "LLM 决策节点（暂停 + 等待 Agent 回答）".to_string(),
            config_schema: BTreeMap::from([
                ("prompt".to_string(), NodeConfigFieldSchema::string_required("给 LLM 的问题")),
                ("options".to_string(), NodeConfigFieldSchema::string("JSON: [{label, route}]")),
            ]),
        },
        // 8. parallel
        NodeMetadata {
            r#type: "parallel".to_string(),
            category: NodeCategory::Builtin,
            label: "并行".to_string(),
            icon: "git-fork".to_string(),
            color: "#06b6d4".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "并行执行多个子分支（fork-join）".to_string(),
            config_schema: BTreeMap::from([
                ("branches".to_string(), NodeConfigFieldSchema::string("JSON: [[nodeId, ...]]")),
            ]),
        },
        // 9. sub_workflow
        NodeMetadata {
            r#type: "sub_workflow".to_string(),
            category: NodeCategory::Builtin,
            label: "子工作流".to_string(),
            icon: "workflow".to_string(),
            color: "#3b82f6".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "嵌套调用另一个工作流".to_string(),
            config_schema: BTreeMap::from([
                ("workflow_id".to_string(), NodeConfigFieldSchema::string_required("子工作流 id")),
                ("version".to_string(), NodeConfigFieldSchema::number("版本（默认最新）", None)),
            ]),
        },
        // 10. code
        NodeMetadata {
            r#type: "code".to_string(),
            category: NodeCategory::Builtin,
            label: "代码".to_string(),
            icon: "code".to_string(),
            color: "#64748b".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "运行一段 JS/TS 表达式".to_string(),
            config_schema: BTreeMap::from([
                ("language".to_string(), NodeConfigFieldSchema::string_with_options("语言", &["js", "ts"])),
                ("code".to_string(), NodeConfigFieldSchema::string_required("源代码")),
            ]),
        },
        // 11. pivot
        NodeMetadata {
            r#type: "pivot".to_string(),
            category: NodeCategory::Builtin,
            label: "映射".to_string(),
            icon: "shuffle".to_string(),
            color: "#14b8a6".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "数据格式转换（input → output）".to_string(),
            config_schema: BTreeMap::from([
                ("mapping".to_string(), NodeConfigFieldSchema::string("JSON: {outputKey: inputTemplate}")),
            ]),
        },
        // 12. loop
        NodeMetadata {
            r#type: "loop".to_string(),
            category: NodeCategory::Builtin,
            label: "循环".to_string(),
            icon: "repeat".to_string(),
            color: "#f97316".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "while 循环节点".to_string(),
            config_schema: BTreeMap::from([
                ("condition".to_string(), NodeConfigFieldSchema::string_required("循环条件")),
                ("max_iterations".to_string(), NodeConfigFieldSchema::number("最大迭代次数", Some(100.0))),
            ]),
        },
        // 13. iterate
        NodeMetadata {
            r#type: "iterate".to_string(),
            category: NodeCategory::Builtin,
            label: "迭代".to_string(),
            icon: "list".to_string(),
            color: "#84cc16".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "for-each 节点（遍历集合执行子图）".to_string(),
            config_schema: BTreeMap::from([
                ("source".to_string(), NodeConfigFieldSchema::string_required("集合表达式")),
                ("item_var".to_string(), NodeConfigFieldSchema::string("当前项变量名（默认 item）")),
            ]),
        },
        // 14. skip
        NodeMetadata {
            r#type: "skip".to_string(),
            category: NodeCategory::Builtin,
            label: "跳过".to_string(),
            icon: "skip-forward".to_string(),
            color: "#94a3b8".to_string(),
            plugin_id: "worldsmith-core".to_string(),
            description: "跳过当前节点（条件满足时）".to_string(),
            config_schema: BTreeMap::from([
                ("when".to_string(), NodeConfigFieldSchema::string("满足此条件时跳过")),
            ]),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_count() {
        let list = builtin_node_metadata();
        assert_eq!(list.len(), 14);
    }

    #[test]
    fn test_types_unique() {
        let list = builtin_node_metadata();
        let types: std::collections::HashSet<_> = list.iter().map(|n| &n.r#type).collect();
        assert_eq!(types.len(), 14, "node types must be unique");
    }

    #[test]
    fn test_required_fields_have_no_default() {
        for n in &builtin_node_metadata() {
            for (k, v) in &n.config_schema {
                if v.required == Some(true) {
                    assert!(v.default.is_none(), "required field {}.{} has default", n.r#type, k);
                }
            }
        }
    }
}
