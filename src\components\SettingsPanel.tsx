import { useState } from 'react';
import { X, Settings, Key, Clock, Bot, Database, Info, Eye, EyeOff, Download, Upload, Trash2, Brain } from 'lucide-react';
import type { ApiConfig, AppSettings } from '../types';
import { exportData, importData } from '../db';
import { getExperienceEngine } from '../jingyan/engine';
import { getPromptGraph } from '../jingyan/promptGraph';

interface SettingsPanelProps {
  apiConfig: ApiConfig;
  setApiConfig: (c: ApiConfig) => void;
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  onClose: () => void;
  onClearAll: () => void;
}

type Tab = 'api' | 'preferences' | 'agent' | 'data' | 'about';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'api', label: 'API 配置', icon: <Key className="w-4 h-4" /> },
  { id: 'preferences', label: '习惯配置', icon: <Clock className="w-4 h-4" /> },
  { id: 'agent', label: 'Agent 配置', icon: <Bot className="w-4 h-4" /> },
  { id: 'data', label: '数据管理', icon: <Database className="w-4 h-4" /> },
  { id: 'about', label: '关于', icon: <Info className="w-4 h-4" /> },
];

export function SettingsPanel({ apiConfig, setApiConfig, settings, setSettings, onClose, onClearAll }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('api');
  const [showApiKey, setShowApiKey] = useState(false);
  const [, setImporting] = useState(false);

  const handleExport = async (includeImages: boolean) => {
    const blob = await exportData(includeImages);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gpt-image-playground-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      await importData(text);
      alert('导入成功！请刷新页面。');
      window.location.reload();
    } catch (err: any) {
      alert('导入失败: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border-primary rounded-2xl w-full max-w-3xl mx-4 h-[80vh] flex overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-48 border-r border-border-primary p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-6 px-2">
            <Settings className="w-5 h-5 text-accent" />
            <span className="font-semibold text-text-primary">设置</span>
            <span className="ml-auto text-xs text-text-muted">v0.6.4</span>
          </div>
          <nav className="space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-text-primary">{TABS.find(t => t.id === activeTab)?.label}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-tertiary text-text-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* API Config Tab */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              {/* Quick provider select */}
              <div>
                <label className="text-xs text-text-muted mb-2 block">快速选择服务商</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: 'Sub2API', url: 'http://192.168.130.125:6363', endpoint: '/v1/images/generations' },
                    { name: 'OpenAI', url: 'https://api.openai.com', endpoint: '/v1/images/generations' },
                    { name: 'artworkers.online', url: 'https://artworkers.online', endpoint: '/v1/images/generations/async' },
                    { name: 'SiliconFlow', url: 'https://api.siliconflow.cn', endpoint: '/v1/images/generations' },
                    { name: '自定义', url: '', endpoint: '' },
                  ].map(p => (
                    <button
                      key={p.name}
                      onClick={() => {
                        if (p.url) {
                          setApiConfig({
                            ...apiConfig,
                            service: p.name,
                            baseUrl: p.url,
                            submitEndpoint: p.endpoint,
                            queryEndpoint: p.endpoint.includes('async') ? '/v1/images/tasks/{task_id}' : p.endpoint,
                          });
                        }
                      }}
                      className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                        apiConfig.baseUrl === p.url && p.url
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border-primary text-text-secondary hover:border-accent/50'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-medium text-text-primary">文生图服务: {apiConfig.service}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">接口地址</label>
                    <input
                      value={apiConfig.baseUrl}
                      onChange={e => setApiConfig({ ...apiConfig, baseUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">提交接口</label>
                    <input
                      value={apiConfig.submitEndpoint}
                      onChange={e => setApiConfig({ ...apiConfig, submitEndpoint: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">生图模型</label>
                    <input
                      value={apiConfig.model}
                      onChange={e => setApiConfig({ ...apiConfig, model: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>

              {/* Text model for prompt enhancement */}
              <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-medium text-text-primary">产品保真与提示词</h3>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-success/30 bg-success/10 p-3">
                    <div>
                      <div className="text-xs font-medium text-success">严格产品保真</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                        有主产品图时，仅生成并审核空背景，再在浏览器本地等比合成产品图层。关闭后可能重新绘制产品。
                      </p>
                    </div>
                    <button
                      onClick={() => setApiConfig({ ...apiConfig, strictComposition: !apiConfig.strictComposition })}
                      className={`relative mt-0.5 h-5 w-10 shrink-0 rounded-full transition-colors ${
                        apiConfig.strictComposition ? 'bg-success' : 'bg-bg-tertiary'
                      }`}
                      aria-label="切换严格产品保真"
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        apiConfig.strictComposition ? 'left-5.5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-text-muted">启用智能提示词</label>
                    <button
                      onClick={() => setApiConfig({ ...apiConfig, enhancePrompt: !apiConfig.enhancePrompt })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        apiConfig.enhancePrompt ? 'bg-accent' : 'bg-bg-tertiary'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        apiConfig.enhancePrompt ? 'left-5.5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">文本模型 (用于分析意图/增强提示词)</label>
                    <select
                      value={apiConfig.textModel}
                      onChange={e => setApiConfig({ ...apiConfig, textModel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="gpt-5.6-sol">gpt-5.6-sol (推荐)</option>
                      <option value="gpt-5.6-luna">gpt-5.6-luna</option>
                      <option value="gpt-5.6-terra">gpt-5.6-terra</option>
                      <option value="gpt-5.4">gpt-5.4</option>
                      <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                      <option value="gpt-5.2">gpt-5.2</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">每次生成张数</label>
                    <select
                      value={apiConfig.imageCount}
                      onChange={e => setApiConfig({ ...apiConfig, imageCount: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value={1}>1 张</option>
                      <option value={2}>2 张</option>
                      <option value={3}>3 张 (推荐)</option>
                      <option value={4}>4 张</option>
                      <option value={5}>5 张</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary mb-2 block">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiConfig.apiKey}
                    onChange={e => setApiConfig({ ...apiConfig, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-4 py-3 rounded-xl bg-bg-input border border-border-primary text-text-primary text-sm focus:outline-none focus:border-accent pr-12"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-2">
                  仅此项可配置；也支持通过 <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-text-secondary">?apiKey=</code> 临时导入。
                </p>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-4">
              {[
                { key: 'submitOnEnter' as const, label: '任务提交方式', desc: 'Ctrl+Enter 提交（关闭则 Enter 提交）' },
                { key: 'clearAfterSubmit' as const, label: '提交后清空输入框', desc: '提交任务后自动清空提示词输入框' },
                { key: 'loadLastInput' as const, label: '重启后加载上次的输入框', desc: '重新打开时恢复上次的提示词内容' },
                { key: 'reuseApiConfig' as const, label: '复用配置时临时复用该任务的 API 配置', desc: '重试时使用该任务的 API 配置' },
                { key: 'showRetryOnSuccess' as const, label: '成功任务仍然展示重试按钮', desc: '即使任务成功也显示重试按钮' },
                { key: 'sendNotification' as const, label: '任务完成后发送系统通知', desc: '生成完成后发送浏览器通知' },
                { key: 'autoScroll' as const, label: '发送消息后自动滚动到底部', desc: '新任务出现时自动滚动' },
                { key: 'formulaTip' as const, label: '公式输出提示', desc: '显示公式相关提示' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between py-3 border-b border-border-primary/50">
                  <div>
                    <p className="text-sm text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.preferences[item.key] as boolean}
                      onChange={e => setSettings({
                        ...settings,
                        preferences: { ...settings.preferences, [item.key]: e.target.checked }
                      })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Agent Tab */}
          {activeTab === 'agent' && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-text-primary mb-2 block">
                  最大工具调用轮数
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.agent.maxToolCalls}
                  onChange={e => setSettings({
                    ...settings,
                    agent: { ...settings.agent, maxToolCalls: Math.min(50, Math.max(1, parseInt(e.target.value) || 15)) }
                  })}
                  className="w-full px-4 py-3 rounded-xl bg-bg-input border border-border-primary text-text-primary text-sm focus:outline-none focus:border-accent"
                />
                <p className="text-xs text-text-muted mt-1">范围: 1-50，默认 15</p>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border-primary/50">
                <div>
                  <p className="text-sm text-text-primary">网络搜索</p>
                  <p className="text-xs text-text-muted mt-0.5">启用 Responses API 的 web_search 工具</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.agent.webSearch}
                    onChange={e => setSettings({
                      ...settings,
                      agent: { ...settings.agent, webSearch: e.target.checked }
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Brain className="w-4 h-4 text-accent" />
                  经验进化数据
                </h3>
                <p className="text-xs text-text-muted">
                  记录每次生图案例和用户反馈，持续学习你的偏好
                </p>
                <button
                  onClick={() => getExperienceEngine().exportToJSON()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm hover:bg-accent/20 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  导出经验数据到 JSON
                </button>
                <p className="text-xs text-text-muted">
                  导出后请保存到 <code className="bg-bg-tertiary px-1 rounded">D:\生图画布\gpt-image-playground\jingyan_jinhua</code> 文件夹
                </p>
              </div>

              <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Brain className="w-4 h-4 text-green-400" />
                  提示词图谱
                </h3>
                <p className="text-xs text-text-muted">
                  从每次生图中学习，构建你的专属提示词知识图谱。用得越多，生成越快、越准。
                </p>
                {(() => {
                  const stats = getPromptGraph().getStats();
                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-green-400">{stats.totalNodes}</div>
                          <div className="text-xs text-text-muted">图谱节点</div>
                        </div>
                        <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-blue-400">{stats.totalEdges}</div>
                          <div className="text-xs text-text-muted">关联边</div>
                        </div>
                        <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-yellow-400">{stats.positiveNodes}</div>
                          <div className="text-xs text-text-muted">高分节点</div>
                        </div>
                        <div className="bg-bg-tertiary rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-purple-400">{stats.categories.length}</div>
                          <div className="text-xs text-text-muted">分类模板</div>
                        </div>
                      </div>
                      {stats.categoryDetails.length > 0 && (
                        <div className="text-xs text-text-muted space-y-1">
                          {stats.categoryDetails.map(c => (
                            <div key={c.name} className="flex justify-between">
                              <span>{c.name}</span>
                              <span>{c.nodeCount}个节点 / 均分{c.avgScore}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          const graph = getPromptGraph();
                          const data = graph.exportDB();
                          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `prompt_graph_${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm hover:bg-green-500/20 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        导出提示词图谱
                      </button>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-primary">导出数据</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm hover:bg-accent/20 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    包含任务和图片
                  </button>
                  <button
                    onClick={() => handleExport(false)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-sm hover:bg-bg-card transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    仅包含配置
                  </button>
                </div>
              </div>

              <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-text-primary">导入数据</h3>
                <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary text-text-secondary text-sm hover:bg-bg-card transition-colors cursor-pointer w-fit">
                  <Upload className="w-4 h-4" />
                  从 ZIP 导入
                  <input type="file" accept=".json,.zip" onChange={handleImport} className="hidden" />
                </label>
              </div>

              <div className="bg-bg-card border border-error/30 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-error">清除数据</h3>
                <button
                  onClick={onClearAll}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-error/10 text-error text-sm hover:bg-error/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  清除所有任务数据
                </button>
              </div>

              <p className="text-xs text-text-muted">
                所有数据存储在浏览器 IndexedDB 中（SHA-256 去重压缩）
              </p>
            </div>
          )}

          {/* About Tab */}
          {activeTab === 'about' && (
            <div className="space-y-4">
              <div className="bg-bg-card border border-border-primary rounded-xl p-6 text-center">
                <h3 className="text-lg font-semibold text-text-primary mb-2">GPT Image Playground</h3>
                <p className="text-sm text-text-muted mb-4">基于 OpenAI gpt-image-2 API 的图片生成与编辑工具</p>
                <div className="space-y-2 text-sm">
                  <p className="text-text-secondary">
                    版本: <span className="text-text-primary font-mono">v0.6.4</span>
                  </p>
                  <p className="text-text-secondary">
                    开源地址:{' '}
                    <a href="https://github.com/CookSleep/gpt_image_playground" target="_blank" className="text-accent hover:underline">
                      GitHub
                    </a>
                  </p>
                  <p className="text-text-secondary">
                    反馈问题:{' '}
                    <a href="https://github.com/CookSleep/gpt_image_playground/issues" target="_blank" className="text-accent hover:underline">
                      Issues
                    </a>
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-muted text-center">MIT License</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

