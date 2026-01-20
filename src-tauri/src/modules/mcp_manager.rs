//! MCP Tool Manager - Manages MCP server connections using Rig's rmcp integration
//! Provides endpoints for loading/unloading MCP servers and querying tools

use rmcp::model::{ClientCapabilities, ClientInfo, Implementation, Tool};
use rmcp::ServiceExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub transport: String,
    #[serde(default)]
    pub bearer_token: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub category: String,
    pub parameters: Value,
    pub server: String,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub transport: String,
    #[serde(default)]
    pub tools_count: u32,
    #[serde(default)]
    pub connected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListServersResponse {
    pub success: bool,
    pub servers: Vec<McpServerStatus>,
    pub total_tools: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListToolsResponse {
    pub success: bool,
    pub tools: Vec<McpTool>,
    pub total: usize,
}

// ============================================================================
// MCP Tool Manager
// ============================================================================

#[derive(Clone)]
pub struct McpToolManager {
    tools: Arc<Mutex<HashMap<String, McpTool>>>,
    loaded_servers: Arc<Mutex<HashSet<String>>>,
    server_configs: Arc<Mutex<HashMap<String, McpServerConfig>>>,
}

impl McpToolManager {
    pub fn new() -> Self {
        Self {
            tools: Arc::new(Mutex::new(HashMap::new())),
            loaded_servers: Arc::new(Mutex::new(HashSet::new())),
            server_configs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn normalize_server_config(name: &str, config: &McpServerConfig) -> McpServerConfig {
        let transport = if config.transport.is_empty() {
            "http".to_string()
        } else {
            config.transport.clone()
        };

        McpServerConfig {
            name: name.to_string(),
            url: config.url.clone(),
            transport,
            bearer_token: config.bearer_token.clone(),
            headers: config.headers.clone(),
        }
    }

    fn tool_to_mcp_tool(server_name: &str, tool: &Tool) -> McpTool {
        let id = format!("mcp_{}_{}", server_name, tool.name);

        // Convert input_schema to Value - input_schema is Arc<Map<String, Value>> in rmcp 0.13.0
        let parameters = {
            let map: &serde_json::Map<String, serde_json::Value> = tool.input_schema.as_ref();
            serde_json::to_value(map).unwrap_or_else(|_| json!({
                "type": "object",
                "properties": {},
                "required": []
            }))
        };

        McpTool {
            id: id.clone(),
            name: tool.name.to_string(),
            description: format!("[MCP] {}", tool.description.as_deref().unwrap_or_default()),
            category: "mcp".to_string(),
            parameters,
            server: server_name.to_string(),
            metadata: json!({
                "serverName": server_name,
                "originalName": tool.name.to_string(),
                "originalDescription": tool.description.as_deref().unwrap_or_default().to_string(),
            }),
        }
    }

    pub async fn load_server(&self, config: McpServerConfig) -> Result<Vec<McpTool>, String> {
        let name = config.name.clone();
        let url = config.url.clone();
        info!("[MCP Manager] Loading MCP server: {} at {}", name, url);

        let normalized = Self::normalize_server_config(&name, &config);
        self.server_configs.lock().await.insert(name.clone(), normalized.clone());

        let tools = self.fetch_tools_from_server(&name, &url).await?;

        let mut tools_map = self.tools.lock().await;
        for tool in &tools {
            let mcp_tool = Self::tool_to_mcp_tool(&name, tool);
            tools_map.insert(mcp_tool.id.clone(), mcp_tool.clone());
        }

        self.loaded_servers.lock().await.insert(name.clone());

        let mcp_tools: Vec<McpTool> = tools_map.values()
            .filter(|t| t.server == name)
            .cloned()
            .collect();

        info!("[MCP Manager] Loaded {} tools from {}", mcp_tools.len(), name);
        Ok(mcp_tools)
    }

    async fn fetch_tools_from_server(&self, name: &str, url: &str) -> Result<Vec<Tool>, String> {
        debug!("[MCP Manager] Connecting to MCP server at {}", url);

        let transport = rmcp::transport::StreamableHttpClientTransport::from_uri(url);

        let client_info = ClientInfo {
            protocol_version: Default::default(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "qurio-rig".to_string(),
                version: "0.1.0".to_string(),
                icons: None,
                title: Some("Qurio MCP Client".to_string()),
                website_url: None,
            },
        };

        let client = client_info
            .serve(transport)
            .await
            .map_err(|e| format!("Failed to create MCP client: {}", e))?;

        let tools_response = client
            .list_tools(Default::default())
            .await
            .map_err(|e| format!("Failed to list tools: {}", e))?;

        debug!("[MCP Manager] Found {} tools from {}", tools_response.tools.len(), name);

        Ok(tools_response.tools)
    }

    pub async fn unload_server(&self, name: &str) -> Result<(), String> {
        info!("[MCP Manager] Unloading MCP server: {}", name);

        let mut tools_map = self.tools.lock().await;
        let server_tools: Vec<String> = tools_map.iter()
            .filter(|(_, t)| t.server == name)
            .map(|(id, _)| id.clone())
            .collect();

        for id in server_tools {
            tools_map.remove(&id);
        }

        self.server_configs.lock().await.remove(name);
        self.loaded_servers.lock().await.remove(name);

        info!("[MCP Manager] Unloaded server: {}", name);
        Ok(())
    }

    pub async fn get_status(&self) -> ListServersResponse {
        let loaded = self.loaded_servers.lock().await.clone();
        let tools_map = self.tools.lock().await;
        let configs = self.server_configs.lock().await;

        let servers: Vec<McpServerStatus> = loaded.iter().map(|name| {
            let config = configs.get(name);
            let tools_count = tools_map.iter()
                .filter(|(_, t)| t.server == *name)
                .count() as u32;

            McpServerStatus {
                name: name.clone(),
                url: config.map(|c| c.url.clone()).unwrap_or_default(),
                transport: config.map(|c| c.transport.clone()).unwrap_or_default(),
                tools_count,
                connected: config.is_some(),
            }
        }).collect();

        ListServersResponse {
            success: true,
            servers,
            total_tools: tools_map.len(),
        }
    }

    pub async fn list_all_tools(&self) -> ListToolsResponse {
        let tools_map = self.tools.lock().await;
        let tools: Vec<McpTool> = tools_map.values().cloned().collect();
        let total = tools.len();

        ListToolsResponse {
            success: true,
            tools,
            total,
        }
    }

    pub async fn list_tools_by_server(&self, server_name: &str) -> ListToolsResponse {
        let tools_map = self.tools.lock().await;
        let tools: Vec<McpTool> = tools_map.values()
            .filter(|t| t.server == server_name)
            .cloned()
            .collect();
        let total = tools.len();

        ListToolsResponse {
            success: true,
            tools,
            total,
        }
    }

    pub async fn get_tool(&self, tool_id: &str) -> Option<McpTool> {
        let tools_map = self.tools.lock().await;
        tools_map.get(tool_id).cloned()
    }

    pub async fn fetch_tools_from_url(&self, name: &str, config: &McpServerConfig) -> Result<Vec<McpToolInfo>, String> {
        let normalized = Self::normalize_server_config(name, config);
        let tools = self.fetch_tools_from_server(name, &normalized.url).await?;

        let tools_info: Vec<McpToolInfo> = tools.iter()
            .map(|t| {
                let id = format!("mcp_{}_{}", name, t.name);
                // input_schema is Arc<Map<String, Value>> in rmcp 0.13.0
                let map: &serde_json::Map<String, serde_json::Value> = t.input_schema.as_ref();
                let parameters = serde_json::to_value(map).unwrap_or_else(|_| json!({}));
                McpToolInfo {
                    id,
                    name: t.name.to_string(),
                    description: t.description.as_deref().unwrap_or_default().to_string(),
                    parameters,
                }
            })
            .collect();

        Ok(tools_info)
    }
}

pub static MCP_TOOL_MANAGER: once_cell::sync::Lazy<Arc<McpToolManager>> =
    once_cell::sync::Lazy::new(|| Arc::new(McpToolManager::new()));
