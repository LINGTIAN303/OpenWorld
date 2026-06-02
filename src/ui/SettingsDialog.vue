<template>
  <div class="set-overlay" v-if="show" @click.self="close">
    <div class="set-shell">
      <div class="set-topbar">
        <div class="set-topbar-left">
          <WsIcon name="settings" size="sm" />
          <span class="set-topbar-title">设置</span>
        </div>
        <div class="set-search-wrap">
          <svg class="set-search-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="5"/><path d="M10.5 10.5L15 15"/></svg>
          <input type="text" class="set-search-input" v-model="searchQuery" placeholder="搜索设置..." />
          <button v-if="searchQuery" class="set-search-clear" @click="searchQuery = ''">✕</button>
        </div>
        <div class="set-topbar-spacer"></div>
        <button class="set-close" @click="close">✕</button>
      </div>

      <nav class="set-tabs">
        <button v-for="cat in categories" :key="cat.id"
          class="set-tab" :class="{ active: activeSection === cat.id }"
          @click="onTabClick(cat.id)">
          <WsIcon :name="cat.icon" size="xs" class="stb-icon" />
          <span class="stb-label">{{ cat.label }}</span>
        </button>
      </nav>

      <div class="set-cards" v-if="activeSection || searchQuery">
        <template v-if="searchQuery">
          <template v-for="cat in matchedCategories" :key="cat.id">
            <template v-if="cat.id === 'appearance'">
              <div v-show="match('主题 theme 外观 深色 浅色 极光 锻造 水墨 棱镜 宇宙 编辑器')" class="set-card">
                <div class="sc-head">主题</div>
                <div class="set-theme-row">
                  <button v-for="t in themes" :key="t.id" class="set-theme-btn" :class="{ on: currentThemeId === t.id }" @click="onThemeChange(t.id)">
                    <WsIcon :name="t.icon" size="md" class="st-icon" />
                    <span class="st-label">{{ t.label }}</span>
                  </button>
                </div>
                <button class="set-theme-editor-btn" @click="openThemeEditor">
                  <WsIcon name="theme-editor" size="xs" /> 主题编辑器
                </button>
              </div>
              <div v-show="match('高亮 highlight 脉冲 动画 淡化 扩散 透明度')" class="set-card">
                <div class="sc-head">高亮</div>
                <div class="set-row"><span>脉冲动画</span><label class="set-toggle"><input type="checkbox" v-model="store.highlight_pulseEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-row"><span>启用淡化</span><label class="set-toggle"><input type="checkbox" v-model="store.highlight_dimmingEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div v-if="store.highlight_dimmingEnabled" class="set-row"><span>淡化模式</span><select v-model="store.highlight_dimmingMode" class="set-select"><option value="simple">简单淡化</option><option value="spread">关系扩散</option></select></div>
                <div v-if="store.highlight_dimmingEnabled" class="set-row"><span>淡化透明度</span><div class="set-range-wrap"><input type="range" min="0.1" max="0.5" step="0.05" v-model.number="store.highlight_dimOpacity" class="set-range" /><span class="set-range-val">{{ store.highlight_dimOpacity }}</span></div></div>
                <div v-if="store.highlight_dimmingEnabled && store.highlight_dimmingMode === 'spread'" class="set-row"><span>扩散跳数</span><select v-model.number="store.highlight_spreadHops" class="set-select"><option :value="1">1 跳</option><option :value="2">2 跳</option><option :value="3">3 跳</option></select></div>
              </div>
            </template>
            <template v-if="cat.id === 'plugins'">
              <div v-show="match('插件 plugin 启用 禁用')" class="set-card">
                <div class="sc-head">插件管理</div>
                <div class="set-plugin-search"><input type="text" v-model="pluginSearch" placeholder="搜索插件..." class="set-input" /></div>
                <draggable v-if="!pluginSearch" :list="pluginList" item-key="id" ghost-class="sp-ghost" drag-class="sp-drag" handle=".sp-grip" @end="onPluginDragEnd" class="set-plugin-list">
                  <template #item="{ element: p }">
                    <div class="set-plugin-item">
                      <span class="sp-grip" title="拖拽排序"><WsIcon name="grip" size="xs" /></span>
                    <span v-if="p.source" class="sp-source">{{ p.source === 'builtin' ? '内置' : p.source === 'local' ? '本地' : '远程' }}</span>
                    <label class="sp-toggle"><input type="checkbox" :checked="p.active" @change="onPluginToggle(p.id)" /><span class="sp-icon"><WsIcon v-if="hasIcon(p.icon)" :name="p.icon" size="sm" /><span v-else>{{ p.icon }}</span></span><span class="sp-label">{{ p.label }}</span></label>
                  </div>
                </template>
              </draggable>
              <div v-else class="set-plugin-list">
                <div v-for="p in filteredPlugins" :key="p.id" class="set-plugin-item">
                    <span v-if="p.source" class="sp-source">{{ p.source === 'builtin' ? '内置' : p.source === 'local' ? '本地' : '远程' }}</span>
                    <label class="sp-toggle"><input type="checkbox" :checked="p.active" @change="onPluginToggle(p.id)" /><span class="sp-icon"><WsIcon v-if="hasIcon(p.icon)" :name="p.icon" size="sm" /><span v-else>{{ p.icon }}</span></span><span class="sp-label">{{ p.label }}</span></label>
                  </div>
                </div>
              </div>
            </template>
            <template v-if="cat.id === 'editor'">
              <div v-show="match('撤销 重做 undo redo 历史')" class="set-card">
                <div class="sc-head">撤销 / 重做</div>
                <div class="set-row"><span>撤销历史条数</span><input type="number" class="set-input set-input-sm" :value="store.undoHistoryLimit" min="5" max="100" @input="onUndoLimitChange" /></div>
                <div class="set-row"><span>多步重做</span><label class="set-toggle"><input type="checkbox" :checked="store.multiStepRedo" @change="store.multiStepRedo = $event.target.checked" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">关闭后 {{ formatKeyForDisplay('ctrl') }}+Y 仅重做一步</div>
              </div>
              <div v-show="match('大纲 outline 内嵌 编辑')" class="set-card">
                <div class="sc-head">大纲</div>
                <div class="set-row"><span>内嵌编辑</span><label class="set-toggle"><input type="checkbox" v-model="store.outlineInlineEdit" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">启用后，大纲节点详情面板底部显示文本编辑区</div>
              </div>
              <div v-show="match('光标 caret 平滑 smooth')" class="set-card">
                <div class="sc-head">光标</div>
                <div class="set-row"><span>平滑光标</span><label class="set-toggle"><input type="checkbox" v-model="store.smoothCaretEnabled" /><span class="set-toggle-slider"></span></label></div>
                <template v-if="store.smoothCaretEnabled">
                  <div class="set-row"><span>动画时长 (ms)</span><input type="number" class="set-input set-input-sm" v-model.number="store.smoothCaretDuration" min="50" max="500" step="10" /></div>
                  <div class="set-row"><span>光标样式</span><select v-model="store.smoothCaretVariant" class="set-select"><option value="line">竖线</option><option value="block">方块</option><option value="underline">下划线</option></select></div>
                </template>
              </div>
            </template>
            <template v-if="cat.id === 'layout'">
              <div v-show="match('思维导图 mindmap 中心 节点')" class="set-card">
                <div class="sc-head">思维导图</div>
                <div class="set-row"><span>中心节点上限</span><input type="number" class="set-input set-input-sm" :value="store.maxCenterNodes" min="1" max="20" @input="onMaxCenterNodesChange" /></div>
              </div>
              <div v-show="match('面板 panel 布局 宽度')" class="set-card">
                <div class="sc-head">面板布局</div>
                <div class="set-row"><span>启用面板数量上限</span><label class="set-toggle"><input type="checkbox" :checked="store.panelLimitEnabled" @change="store.panelLimitEnabled = $event.target.checked" /><span class="set-toggle-slider"></span></label></div>
                <div v-if="panelWidths.length > 0" class="set-panel-widths">
                  <div v-for="pw in panelWidths" :key="pw.panelId" class="spw-row"><span class="spw-label">{{ panelLabel(pw.panelId) }}</span><span class="spw-value">{{ pw.width }}px</span><button class="spw-reset" @click="onResetPanelWidth(pw.panelId)">↺</button></div>
                  <button class="set-btn" @click="resetAllWidths">重置所有面板宽度</button>
                </div>
              </div>
              <div v-show="match('字段 field 预设 布局 重置')" class="set-card">
                <div class="sc-head">字段布局预设</div>
                <div class="set-hint">重置后恢复插件原始字段顺序，删除所有自定义字段和用户预设</div>
                <div class="set-btn-row">
                  <button class="set-btn" @click="resetFieldPresets">重置所有字段预设</button>
                  <button class="set-btn set-btn-danger" @click="resetCustomFields">清除所有自定义字段</button>
                </div>
              </div>
              <div v-show="match('时间线 timeline 拖拽 泳道 甘特图 紧凑 分组')" class="set-card">
                <div class="sc-head">时间线</div>
                <div class="set-row"><span>拖拽改时间</span><label class="set-toggle"><input type="checkbox" v-model="store.timelineDragEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">启用后可在水平模式中拖拽事件条形修改日期</div>
                <div class="set-row"><span>默认布局模式</span><select v-model="store.timelineDefaultMode" class="set-select"><option value="vertical">垂直时间线</option><option value="horizontal">水平甘特图</option></select></div>
                <div class="set-row"><span>默认泳道分组</span><select v-model="store.timelineDefaultGroup" class="set-select"><option value="none">无分组</option><option value="character">按角色</option><option value="location">按地点</option><option value="era">按纪元</option><option value="tag">按标签</option></select></div>
                <div class="set-row"><span>紧凑模式</span><label class="set-toggle"><input type="checkbox" v-model="store.timelineCompactMode" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">垂直模式下使用紧凑卡片布局</div>
              </div>
            </template>
            <template v-if="cat.id === 'relations'">
              <div v-show="match('关系 relation 自动 创建 实体')" class="set-card">
                <div class="sc-head">关系</div>
                <div class="set-row"><span>自动创建实体提示</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateEntityEnabled" /><span class="set-toggle-slider"></span></label></div>
                <template v-if="store.autoCreateEntityEnabled">
                  <div class="set-row set-row-sub"><span>关系选择器中触发</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateSelectorEnabled" /><span class="set-toggle-slider"></span></label></div>
                  <div class="set-row set-row-sub"><span>实体引用字段中触发</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateEntityRefEnabled" /><span class="set-toggle-slider"></span></label></div>
                  <div class="set-row set-row-sub"><span>图谱视图中触发</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateGraphEnabled" /><span class="set-toggle-slider"></span></label></div>
                </template>
              </div>
            </template>
            <template v-if="cat.id === 'video'">
              <div v-show="match('视频模式 video 启用 开关')" class="set-card">
                <div class="sc-head">视频模式</div>
                <div class="set-row"><span>启用视频模式</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">编辑实体时，AI 以角色身份弹出通知评论</div>
              </div>
              <div v-show="match('弹窗 持续 时间 duration 防抖 超时')" class="set-card">
                <div class="sc-head">触发与弹窗</div>
                <div class="set-row"><span>弹窗持续时间（秒）</span><div class="set-range-wrap"><input type="range" min="3" max="15" step="1" v-model.number="store.videoModeDuration" class="set-range" /><span class="set-range-val">{{ store.videoModeDuration }}s</span></div></div>
                <div class="set-row"><span>防抖等待（秒）</span><div class="set-range-wrap"><input type="range" min="2" max="15" step="1" v-model.number="store.videoModeDebounce" class="set-range" /><span class="set-range-val">{{ store.videoModeDebounce }}s</span></div></div>
                <div class="set-row"><span>LLM 超时（秒）</span><div class="set-range-wrap"><input type="range" min="1" max="10" step="1" v-model.number="store.videoModeTimeout" class="set-range" /><span class="set-range-val">{{ store.videoModeTimeout }}s</span></div></div>
                <div class="set-row"><span>连续失败上限</span><div class="set-range-wrap"><input type="range" min="1" max="10" step="1" v-model.number="store.videoModeMaxFailures" class="set-range" /><span class="set-range-val">{{ store.videoModeMaxFailures }}次</span></div></div>
                <div class="set-row"><span>停顿触发阈值（秒）</span><div class="set-range-wrap"><input type="range" min="1" max="5" step="0.5" v-model.number="store.videoModePauseThreshold" class="set-range" /><span class="set-range-val">{{ store.videoModePauseThreshold }}s</span></div></div>
                <div class="set-row"><span>断句触发</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeSentenceTrigger" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-row"><span>字数触发阈值</span><div class="set-range-wrap"><input type="range" min="5" max="50" step="5" v-model.number="store.videoModeCharThreshold" class="set-range" /><span class="set-range-val">{{ store.videoModeCharThreshold }}字</span></div></div>
              </div>
              <div v-show="match('人格 persona 跨插件 角色 附体 切换 概率')" class="set-card">
                <div class="sc-head">人格设置</div>
                <div class="set-row"><span>人格过渡动画</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModePersonaTransition" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-row"><span>跨插件人格附体</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeCrossPlugin" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">编辑非生命体实体时，AI 可能以角色/种族/势力的人格说话</div>
                <div v-if="store.videoModeCrossPlugin" class="set-row set-row-sub"><span>人格切换概率</span><div class="set-range-wrap"><input type="range" min="0" max="100" step="5" v-model.number="store.videoModePersonaSwitchChance" class="set-range" /><span class="set-range-val">{{ store.videoModePersonaSwitchChance }}%</span></div></div>
              </div>
              <div v-show="match('概率 luck 运气 活跃 沉默')" class="set-card">
                <div class="sc-head">概率体系</div>
                <div class="set-row"><span>全局运气</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeLuckEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">启用后，AI 会经历"活跃期"和"沉默期"，表现更自然</div>
                <template v-if="store.videoModeLuckEnabled">
                  <div class="set-row set-row-sub"><span>运气重置周期（分钟）</span><div class="set-range-wrap"><input type="range" min="3" max="15" step="1" v-model.number="store.videoModeLuckResetMinutes" class="set-range" /><span class="set-range-val">{{ store.videoModeLuckResetMinutes }}分</span></div></div>
                  <div class="set-row set-row-sub"><span>运气重置操作数</span><div class="set-range-wrap"><input type="range" min="5" max="30" step="1" v-model.number="store.videoModeLuckResetOps" class="set-range" /><span class="set-range-val">{{ store.videoModeLuckResetOps }}次</span></div></div>
                </template>
              </div>
              <div v-show="match('场景 scene 概率 probability 触发')" class="set-card">
                <div class="sc-head">场景概率</div>
                <div class="set-hint" style="margin-bottom:8px">每种操作场景的独立触发概率</div>
                <div v-for="sp in sceneProbItems" :key="sp.id" class="set-row">
                  <span>{{ sp.label }}</span>
                  <div class="set-range-wrap"><input type="range" min="0" max="100" step="5" :value="store.videoModeSceneProbs[sp.id] ?? sp.defaultVal" @input="onSceneProbChange(sp.id, $event)" class="set-range" /><span class="set-range-val">{{ store.videoModeSceneProbs[sp.id] ?? sp.defaultVal }}%</span></div>
                </div>
              </div>
              <div v-show="match('弹窗 位置 场景化 停驻 pin 点击')" class="set-card">
                <div class="sc-head">弹窗交互</div>
                <div class="set-row"><span>弹窗位置场景化</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModePositionContext" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">根据操作场景自动调整弹窗出现位置</div>
                <div class="set-row"><span>点击停驻</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeClickPin" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-hint">点击弹窗可停驻并查看历史消息</div>
              </div>
            </template>
            <template v-if="cat.id === 'shortcuts'">
              <div v-show="match('快捷键 keyboard shortcut 键盘')" class="set-card">
                <div class="sc-head">快捷键</div>
                <div class="set-hint" style="margin-bottom:8px">点击快捷键开始记录，按下新的组合键即可修改</div>
                <div v-for="grp in shortcutGroups" :key="grp.scope" v-show="match('快捷键 ' + scopeLabel(grp.scope))" class="ss-group">
                  <h5 class="ss-scope">{{ scopeLabel(grp.scope) }}</h5>
                  <div v-for="s in grp.items" :key="s.id" v-show="match(s.description + ' ' + s.id)" class="ss-row">
                    <span class="ss-desc">{{ s.description }}</span>
                    <div class="ss-keys-area">
                      <span v-if="recording !== s.id" class="ss-keys" @click="startRecord(s.id)">
                        <kbd v-for="k in getDisplayKeys(s)" :key="k" class="ss-kbd">{{ fmt(k) }}</kbd>
                        <span class="ss-edit-icon"><WsIcon name="edit" size="xs" /></span>
                      </span>
                      <span v-else class="ss-recording" @click="cancelRecord">按下新的组合键...</span>
                      <button v-if="hasOverride(s.id)" class="ss-reset" @click.stop="resetKey(s.id)">↺</button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </template>
          <div v-if="matchedCategories.length === 0" class="set-empty">未找到匹配的设置项</div>
        </template>

        <template v-else>
          <template v-if="activeSection === 'appearance'">
            <div class="set-card">
              <div class="sc-head">主题</div>
              <div class="set-theme-row">
                <button v-for="t in themes" :key="t.id" class="set-theme-btn" :class="{ on: currentThemeId === t.id }" @click="onThemeChange(t.id)">
                  <WsIcon :name="t.icon" size="md" class="st-icon" />
                  <span class="st-label">{{ t.label }}</span>
                </button>
              </div>
              <button class="set-theme-editor-btn" @click="openThemeEditor">
                <WsIcon name="theme-editor" size="xs" /> 主题编辑器
              </button>
            </div>
            <div class="set-card">
              <div class="sc-head">高亮</div>
              <div class="set-row"><span>脉冲动画</span><label class="set-toggle"><input type="checkbox" v-model="store.highlight_pulseEnabled" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-row"><span>启用淡化</span><label class="set-toggle"><input type="checkbox" v-model="store.highlight_dimmingEnabled" /><span class="set-toggle-slider"></span></label></div>
              <template v-if="store.highlight_dimmingEnabled">
                <div class="set-row"><span>淡化模式</span><select v-model="store.highlight_dimmingMode" class="set-select"><option value="simple">简单淡化</option><option value="spread">关系扩散</option></select></div>
                <div class="set-row"><span>淡化透明度</span><div class="set-range-wrap"><input type="range" min="0.1" max="0.5" step="0.05" v-model.number="store.highlight_dimOpacity" class="set-range" /><span class="set-range-val">{{ store.highlight_dimOpacity }}</span></div></div>
                <div v-if="store.highlight_dimmingMode === 'spread'" class="set-row"><span>扩散跳数</span><select v-model.number="store.highlight_spreadHops" class="set-select"><option :value="1">1 跳</option><option :value="2">2 跳</option><option :value="3">3 跳</option></select></div>
              </template>
            </div>
          </template>

          <template v-if="activeSection === 'plugins'">
            <div class="set-card">
              <div class="sc-head">插件管理</div>
              <div class="set-plugin-search"><input type="text" v-model="pluginSearch" placeholder="搜索插件..." class="set-input" /></div>
              <draggable v-if="!pluginSearch" :list="pluginList" item-key="id" ghost-class="sp-ghost" drag-class="sp-drag" handle=".sp-grip" @end="onPluginDragEnd" class="set-plugin-list">
                <template #item="{ element: p }">
                  <div class="set-plugin-item">
                    <span class="sp-grip" title="拖拽排序"><WsIcon name="grip" size="xs" /></span>
                    <span v-if="p.source" class="sp-source">{{ p.source === 'builtin' ? '内置' : p.source === 'local' ? '本地' : '远程' }}</span>
                    <label class="sp-toggle"><input type="checkbox" :checked="p.active" @change="onPluginToggle(p.id)" /><span class="sp-icon"><WsIcon v-if="hasIcon(p.icon)" :name="p.icon" size="sm" /><span v-else>{{ p.icon }}</span></span><span class="sp-label">{{ p.label }}</span></label>
                  </div>
                </template>
              </draggable>
              <div v-else class="set-plugin-list">
                <div v-for="p in filteredPlugins" :key="p.id" class="set-plugin-item">
                  <span v-if="p.source" class="sp-source">{{ p.source === 'builtin' ? '内置' : p.source === 'local' ? '本地' : '远程' }}</span>
                  <label class="sp-toggle"><input type="checkbox" :checked="p.active" @change="onPluginToggle(p.id)" /><span class="sp-icon"><WsIcon v-if="hasIcon(p.icon)" :name="p.icon" size="sm" /><span v-else>{{ p.icon }}</span></span><span class="sp-label">{{ p.label }}</span></label>
                </div>
              </div>
            </div>
          </template>

          <template v-if="activeSection === 'editor'">
            <div class="set-card">
              <div class="sc-head">撤销 / 重做</div>
              <div class="set-row"><span>撤销历史条数</span><input type="number" class="set-input set-input-sm" :value="store.undoHistoryLimit" min="5" max="100" @input="onUndoLimitChange" /></div>
              <div class="set-row"><span>多步重做</span><label class="set-toggle"><input type="checkbox" :checked="store.multiStepRedo" @change="store.multiStepRedo = $event.target.checked" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">关闭后 {{ formatKeyForDisplay('ctrl') }}+Y 仅重做一步</div>
            </div>
            <div class="set-card">
              <div class="sc-head">大纲</div>
              <div class="set-row"><span>内嵌编辑</span><label class="set-toggle"><input type="checkbox" v-model="store.outlineInlineEdit" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">启用后，大纲节点详情面板底部显示文本编辑区</div>
            </div>
            <div class="set-card">
              <div class="sc-head">光标</div>
              <div class="set-row"><span>平滑光标</span><label class="set-toggle"><input type="checkbox" v-model="store.smoothCaretEnabled" /><span class="set-toggle-slider"></span></label></div>
              <template v-if="store.smoothCaretEnabled">
                <div class="set-row"><span>动画时长 (ms)</span><input type="number" class="set-input set-input-sm" v-model.number="store.smoothCaretDuration" min="50" max="500" step="10" /></div>
                <div class="set-row"><span>光标样式</span><select v-model="store.smoothCaretVariant" class="set-select"><option value="line">竖线</option><option value="block">方块</option><option value="underline">下划线</option></select></div>
              </template>
            </div>
          </template>

          <template v-if="activeSection === 'layout'">
            <div class="set-card">
              <div class="sc-head">思维导图</div>
              <div class="set-row"><span>中心节点上限</span><input type="number" class="set-input set-input-sm" :value="store.maxCenterNodes" min="1" max="20" @input="onMaxCenterNodesChange" /></div>
            </div>
            <div class="set-card">
              <div class="sc-head">面板布局</div>
              <div class="set-row"><span>启用面板数量上限</span><label class="set-toggle"><input type="checkbox" :checked="store.panelLimitEnabled" @change="store.panelLimitEnabled = $event.target.checked" /><span class="set-toggle-slider"></span></label></div>
              <div v-if="panelWidths.length > 0" class="set-panel-widths">
                <div v-for="pw in panelWidths" :key="pw.panelId" class="spw-row"><span class="spw-label">{{ panelLabel(pw.panelId) }}</span><span class="spw-value">{{ pw.width }}px</span><button class="spw-reset" @click="onResetPanelWidth(pw.panelId)">↺</button></div>
                <button class="set-btn" @click="resetAllWidths">重置所有面板宽度</button>
              </div>
            </div>
            <div class="set-card">
              <div class="sc-head">字段布局预设</div>
              <div class="set-hint">重置后恢复插件原始字段顺序，删除所有自定义字段和用户预设</div>
              <div class="set-btn-row">
                <button class="set-btn" @click="resetFieldPresets">重置所有字段预设</button>
                <button class="set-btn set-btn-danger" @click="resetCustomFields">清除所有自定义字段</button>
              </div>
            </div>
            <div class="set-card">
              <div class="sc-head">时间线</div>
              <div class="set-row"><span>拖拽改时间</span><label class="set-toggle"><input type="checkbox" v-model="store.timelineDragEnabled" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">启用后可在水平模式中拖拽事件条形修改日期</div>
              <div class="set-row"><span>默认布局模式</span><select v-model="store.timelineDefaultMode" class="set-select"><option value="vertical">垂直时间线</option><option value="horizontal">水平甘特图</option></select></div>
              <div class="set-row"><span>默认泳道分组</span><select v-model="store.timelineDefaultGroup" class="set-select"><option value="none">无分组</option><option value="character">按角色</option><option value="location">按地点</option><option value="era">按纪元</option><option value="tag">按标签</option></select></div>
              <div class="set-row"><span>紧凑模式</span><label class="set-toggle"><input type="checkbox" v-model="store.timelineCompactMode" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">垂直模式下使用紧凑卡片布局</div>
            </div>
          </template>

          <template v-if="activeSection === 'relations'">
            <div class="set-card">
              <div class="sc-head">关系</div>
              <div class="set-row"><span>自动创建实体提示</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateEntityEnabled" /><span class="set-toggle-slider"></span></label></div>
              <template v-if="store.autoCreateEntityEnabled">
                <div class="set-row set-row-sub"><span>关系选择器中触发</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateSelectorEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-row set-row-sub"><span>实体引用字段中触发</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateEntityRefEnabled" /><span class="set-toggle-slider"></span></label></div>
                <div class="set-row set-row-sub"><span>图谱视图中触发</span><label class="set-toggle"><input type="checkbox" v-model="store.autoCreateGraphEnabled" /><span class="set-toggle-slider"></span></label></div>
              </template>
            </div>
          </template>

          <template v-if="activeSection === 'video'">
            <div class="set-card">
              <div class="sc-head">视频模式</div>
              <div class="set-row"><span>启用视频模式</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeEnabled" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">编辑实体时，AI 以角色身份弹出通知评论</div>
            </div>
            <div class="set-card">
              <div class="sc-head">触发与弹窗</div>
              <div class="set-row"><span>弹窗持续时间（秒）</span><div class="set-range-wrap"><input type="range" min="3" max="15" step="1" v-model.number="store.videoModeDuration" class="set-range" /><span class="set-range-val">{{ store.videoModeDuration }}s</span></div></div>
              <div class="set-row"><span>防抖等待（秒）</span><div class="set-range-wrap"><input type="range" min="2" max="15" step="1" v-model.number="store.videoModeDebounce" class="set-range" /><span class="set-range-val">{{ store.videoModeDebounce }}s</span></div></div>
              <div class="set-row"><span>LLM 超时（秒）</span><div class="set-range-wrap"><input type="range" min="1" max="10" step="1" v-model.number="store.videoModeTimeout" class="set-range" /><span class="set-range-val">{{ store.videoModeTimeout }}s</span></div></div>
              <div class="set-row"><span>连续失败上限</span><div class="set-range-wrap"><input type="range" min="1" max="10" step="1" v-model.number="store.videoModeMaxFailures" class="set-range" /><span class="set-range-val">{{ store.videoModeMaxFailures }}次</span></div></div>
              <div class="set-row"><span>停顿触发阈值（秒）</span><div class="set-range-wrap"><input type="range" min="1" max="5" step="0.5" v-model.number="store.videoModePauseThreshold" class="set-range" /><span class="set-range-val">{{ store.videoModePauseThreshold }}s</span></div></div>
              <div class="set-row"><span>断句触发</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeSentenceTrigger" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-row"><span>字数触发阈值</span><div class="set-range-wrap"><input type="range" min="5" max="50" step="5" v-model.number="store.videoModeCharThreshold" class="set-range" /><span class="set-range-val">{{ store.videoModeCharThreshold }}字</span></div></div>
            </div>
            <div class="set-card">
              <div class="sc-head">人格设置</div>
              <div class="set-row"><span>人格过渡动画</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModePersonaTransition" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-row"><span>跨插件人格附体</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeCrossPlugin" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">编辑非生命体实体时，AI 可能以角色/种族/势力的人格说话</div>
              <div v-if="store.videoModeCrossPlugin" class="set-row set-row-sub"><span>人格切换概率</span><div class="set-range-wrap"><input type="range" min="0" max="100" step="5" v-model.number="store.videoModePersonaSwitchChance" class="set-range" /><span class="set-range-val">{{ store.videoModePersonaSwitchChance }}%</span></div></div>
            </div>
            <div class="set-card">
              <div class="sc-head">概率体系</div>
              <div class="set-row"><span>全局运气</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeLuckEnabled" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">启用后，AI 会经历"活跃期"和"沉默期"，表现更自然</div>
              <template v-if="store.videoModeLuckEnabled">
                <div class="set-row set-row-sub"><span>运气重置周期（分钟）</span><div class="set-range-wrap"><input type="range" min="3" max="15" step="1" v-model.number="store.videoModeLuckResetMinutes" class="set-range" /><span class="set-range-val">{{ store.videoModeLuckResetMinutes }}分</span></div></div>
                <div class="set-row set-row-sub"><span>运气重置操作数</span><div class="set-range-wrap"><input type="range" min="5" max="30" step="1" v-model.number="store.videoModeLuckResetOps" class="set-range" /><span class="set-range-val">{{ store.videoModeLuckResetOps }}次</span></div></div>
              </template>
            </div>
            <div class="set-card">
              <div class="sc-head">场景概率</div>
              <div class="set-hint" style="margin-bottom:8px">每种操作场景的独立触发概率</div>
              <div v-for="sp in sceneProbItems" :key="sp.id" class="set-row">
                <span>{{ sp.label }}</span>
                <div class="set-range-wrap"><input type="range" min="0" max="100" step="5" :value="store.videoModeSceneProbs[sp.id] ?? sp.defaultVal" @input="onSceneProbChange(sp.id, $event)" class="set-range" /><span class="set-range-val">{{ store.videoModeSceneProbs[sp.id] ?? sp.defaultVal }}%</span></div>
              </div>
            </div>
            <div class="set-card">
              <div class="sc-head">弹窗交互</div>
              <div class="set-row"><span>弹窗位置场景化</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModePositionContext" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">根据操作场景自动调整弹窗出现位置</div>
              <div class="set-row"><span>点击停驻</span><label class="set-toggle"><input type="checkbox" v-model="store.videoModeClickPin" /><span class="set-toggle-slider"></span></label></div>
              <div class="set-hint">点击弹窗可停驻并查看历史消息</div>
            </div>
          </template>

          <template v-if="activeSection === 'shortcuts'">
            <div class="set-card">
              <div class="sc-head">快捷键</div>
              <div class="set-hint" style="margin-bottom:8px">点击快捷键开始记录，按下新的组合键即可修改</div>
              <div v-for="grp in shortcutGroups" :key="grp.scope" class="ss-group">
                <h5 class="ss-scope">{{ scopeLabel(grp.scope) }}</h5>
                <div v-for="s in grp.items" :key="s.id" class="ss-row">
                  <span class="ss-desc">{{ s.description }}</span>
                  <div class="ss-keys-area">
                    <span v-if="recording !== s.id" class="ss-keys" @click="startRecord(s.id)">
                      <kbd v-for="k in getDisplayKeys(s)" :key="k" class="ss-kbd">{{ fmt(k) }}</kbd>
                      <span class="ss-edit-icon"><WsIcon name="edit" size="xs" /></span>
                    </span>
                    <span v-else class="ss-recording" @click="cancelRecord">按下新的组合键...</span>
                    <button v-if="hasOverride(s.id)" class="ss-reset" @click.stop="resetKey(s.id)">↺</button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-if="activeSection === 'storage'">
            <StorageManagementTab />
          </template>
        </template>
      </div>

      <div class="resize-handle-right" v-if="false" @mousedown="modalResizable.onResizeStart"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { useTheme } from '../composables/useTheme'
import { usePluginStore } from '@worldsmith/entity-core'
import { useShortcuts, formatKeyForDisplay, useConfirm, useResizable, getAllPanelWidths, resetPanelWidth, resetAllPanelWidths, PANEL_LABELS } from '@worldsmith/ui-kit'
import WsIcon from './WsIcon.vue'
import { hasIcon } from '../assets/iconRegistry'
import { useFieldOrderStore, fieldRegistry } from '@worldsmith/entity-core'
import { toastSuccess } from '../composables/useToast'
import draggable from 'vuedraggable'
import StorageManagementTab from './StorageManagementTab.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: [] }>()

const modalResizable = useResizable({ panelId: 'modal-settings', defaultWidth: 560, minWidth: 400, side: 'right' })

const panelWidths = ref<{ panelId: string; width: number }[]>([])

function refreshPanelWidths() {
  panelWidths.value = getAllPanelWidths()
}

watch(() => props.show, (val) => {
  if (val) {
    dirty.value = false
    activeSection.value = null
    refreshPanelWidths()
  }
})

function panelLabel(panelId: string): string {
  return PANEL_LABELS[panelId] || panelId
}

function onResetPanelWidth(id: string) {
  resetPanelWidth(id)
  refreshPanelWidths()
  toastSuccess('已恢复默认宽度')
}

function resetAllWidths() {
  resetAllPanelWidths()
  refreshPanelWidths()
  toastSuccess('已重置所有面板宽度')
}

const store = useSettingsStore()
const uiStore = useUIStore()
const { currentThemeId, setTheme: setThemeFromEngine } = useTheme()
const pluginStore = usePluginStore()
const fieldOrderStore = useFieldOrderStore()
const { confirm } = useConfirm()

const { updateKeys } = useShortcuts()

const dirty = ref(false)

const themes = [
  { id: 'aurora-abyss', icon: 'theme-aurora-abyss', label: '极光深渊' },
  { id: 'light', icon: 'theme-light', label: '明亮' },
  { id: 'forge-ember', icon: 'theme-forge-ember', label: '锻造炉' },
  { id: 'ink-scroll', icon: 'theme-ink-scroll', label: '水墨卷轴' },
  { id: 'crystal-prism', icon: 'theme-crystal-prism', label: '晶体棱镜' },
  { id: 'cosmic', icon: 'theme-cosmic', label: '宇宙' },
]

const categories = [
  { id: 'appearance', icon: 'cat-appearance', label: '外观' },
  { id: 'plugins', icon: 'cat-plugins', label: '插件' },
  { id: 'editor', icon: 'cat-editor', label: '编辑' },
  { id: 'layout', icon: 'cat-layout', label: '布局' },
  { id: 'relations', icon: 'cat-relations', label: '关系' },
  { id: 'video', icon: 'cat-video', label: '视频模式' },
  { id: 'shortcuts', icon: 'cat-shortcuts', label: '快捷键' },
  { id: 'storage', icon: 'cat-storage', label: '存储' },
]

const activeSection = ref<string | null>(null)
const searchQuery = ref('')
const pluginSearch = ref('')

const CATEGORY_KEYWORDS: Record<string, string> = {
  appearance: '主题 外观 深色 浅色 宇宙 极光 锻造 水墨 棱镜 编辑器 高亮 脉冲 动画 淡化 扩散 透明度 theme highlight',
  plugins: '插件 扩展 模块 启用 禁用 内置 本地 远程 plugin',
  editor: '编辑 撤销 重做 历史 大纲 内嵌 光标 平滑 undo redo outline caret smooth',
  layout: '布局 面板 思维导图 中心节点 字段 预设 宽度 panel mindmap field 时间线 timeline 拖拽 泳道 甘特图 紧凑 分组',
  relations: '关系 自动 创建 实体 引用 图谱 选择器 relation auto create',
  video: '视频模式 video 通知 弹窗 人格 角色 附体 persona 概率 运气 场景 停驻 断句 字数',
  shortcuts: '快捷键 键盘 快捷 绑定 shortcut keyboard',
  storage: '存储 清理 孤立 文件 诊断 缓存 空间 配额 storage cleanup orphan diagnostic',
}

const matchedCategories = computed(() => {
  if (!searchQuery.value) return []
  const q = searchQuery.value.toLowerCase()
  return categories.filter(cat => CATEGORY_KEYWORDS[cat.id]?.toLowerCase().includes(q))
})

function match(keywords: string): boolean {
  if (!searchQuery.value) return true
  const q = searchQuery.value.toLowerCase()
  return keywords.toLowerCase().includes(q)
}

const pluginList = ref(store.plugins.map(p => ({ ...p })))

function syncPluginList() {
  const order = uiStore.sidebarOrder
  const sorted = [...store.plugins].sort((a, b) => {
    const va = pluginStore.views.find(v => v.pluginId === a.id)
    const vb = pluginStore.views.find(v => v.pluginId === b.id)
    const ia = va ? order.indexOf(va.id) : 999
    const ib = vb ? order.indexOf(vb.id) : 999
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  pluginList.value = sorted.map(p => ({ ...p }))
}

watch(() => [uiStore.sidebarOrder, store.plugins] as const, () => {
  syncPluginList()
}, { deep: true, immediate: true })

const filteredPlugins = computed(() => {
  if (!pluginSearch.value) return pluginList.value
  const q = pluginSearch.value.toLowerCase()
  return pluginList.value.filter(p =>
    p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  )
})

function onPluginDragEnd() {
  const newOrder = pluginList.value
    .map(p => pluginStore.views.find(v => v.pluginId === p.id)?.id)
    .filter((id): id is string => !!id)
  const existing = new Set(newOrder)
  for (const id of uiStore.sidebarOrder) {
    if (!existing.has(id)) newOrder.push(id)
  }
  uiStore.sidebarOrder = newOrder
  dirty.value = true
}

function onTabClick(id: string) {
  activeSection.value = activeSection.value === id ? null : id
  searchQuery.value = ''
  pluginSearch.value = ''
}

function onThemeChange(id: string) {
  setThemeFromEngine(id)
  dirty.value = true
}

function openThemeEditor() {
  window.dispatchEvent(new CustomEvent('ws-open-theme-editor'))
}

function onPluginToggle(id: string) {
  store.togglePlugin(id)
  dirty.value = true
}

function onUndoLimitChange(e: Event) {
  const val = Number((e.target as HTMLInputElement).value)
  if (val >= 5 && val <= 100) {
    store.undoHistoryLimit = val
    dirty.value = true
  }
}

function onMaxCenterNodesChange(e: Event) {
  const val = Number((e.target as HTMLInputElement).value)
  if (val >= 1 && val <= 20) {
    store.maxCenterNodes = val
    dirty.value = true
  }
}

async function resetFieldPresets() {
  const ok = await confirm({ type: 'danger', title: '重置字段布局预设', description: '确定要重置所有字段布局预设吗？这将恢复插件原始字段顺序，删除所有用户预设。' })
  if (!ok) return
  fieldOrderStore.resetAll()
  fieldRegistry.resetToBuiltin()
  toastSuccess('已重置所有字段预设')
}

async function resetCustomFields() {
  const ok = await confirm({ type: 'danger', title: '清除自定义字段', description: '确定要清除所有自定义字段吗？此操作不可撤销！' })
  if (!ok) return
  fieldRegistry.resetToBuiltin()
  toastSuccess('已清除所有自定义字段')
}

function close() {
  if (dirty.value) {
    const currentView = uiStore.currentView
    if (currentView) {
      const view = pluginStore.getView(currentView)
      if (view?.pluginId && !store.isActive(view.pluginId)) {
        const firstActive = pluginStore.views.find(v => !v.pluginId || store.isActive(v.pluginId))
        if (firstActive) {
          uiStore.setView(firstActive.id)
          uiStore.viewComponent = firstActive.component
        }
      }
    }
    uiStore.viewRefreshKey++
  }
  dirty.value = false
  searchQuery.value = ''
  pluginSearch.value = ''
  emit('close')
}

interface ShortcutItem {
  id: string; description: string; keys: string[]; scope: string
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: 'help.shortcuts', description: '打开快捷键帮助', keys: ['?'], scope: 'global' },
  { id: 'sidebar.toggle', description: '切换侧边栏', keys: ['ctrl', 'b'], scope: 'global' },
  { id: 'search.open', description: '全局搜索', keys: ['ctrl', 'k'], scope: 'global' },
  { id: 'menu.import-export', description: '导入/导出', keys: ['ctrl', 'shift', 's'], scope: 'global' },
  { id: 'settings.open', description: '打开设置', keys: ['ctrl', ','], scope: 'global' },
  { id: 'undo', description: '撤销', keys: ['ctrl', 'z'], scope: 'global' },
  { id: 'redo', description: '重做', keys: ['ctrl', 'shift', 'z'], scope: 'global' },
  { id: 'redo-alt', description: '重做（替代）', keys: ['ctrl', 'y'], scope: 'global' },
  { id: 'global.undo', description: '撤销', keys: ['ctrl', 'z'], scope: 'global' },
  { id: 'global.redo', description: '重做', keys: ['ctrl', 'y'], scope: 'global' },
  { id: 'global.undoHistory', description: '撤销历史面板', keys: ['ctrl', 'shift', 'z'], scope: 'global' },
  { id: 'entity.save', description: '保存实体', keys: ['ctrl', 's'], scope: 'view' },
  { id: 'entity.delete', description: '删除实体', keys: ['delete'], scope: 'view' },
  { id: 'panel.close', description: '关闭详情面板', keys: ['escape'], scope: 'view' },
  { id: 'dialog.confirm', description: '确认弹窗', keys: ['enter'], scope: 'modal' },
  { id: 'dialog.cancel', description: '取消弹窗', keys: ['escape'], scope: 'modal' },
  { id: 'region.borderline', description: '区域图谱：边境线模式', keys: ['alt'], scope: 'view' },
  { id: 'drawing.undo', description: '画板：撤销', keys: ['ctrl', 'z'], scope: 'view' },
  { id: 'drawing.redo', description: '画板：重做', keys: ['ctrl', 'shift', 'z'], scope: 'view' },
  { id: 'drawing.zoomIn', description: '画板：放大', keys: ['ctrl', '='], scope: 'view' },
  { id: 'drawing.zoomOut', description: '画板：缩小', keys: ['ctrl', '-'], scope: 'view' },
  { id: 'drawing.fitView', description: '画板：适应视图', keys: ['ctrl', '0'], scope: 'view' },
  { id: 'mindmap.newCharacter', description: '思维导图：新建角色', keys: ['n', 'c'], scope: 'view' },
  { id: 'mindmap.newRegion', description: '思维导图：新建区域', keys: ['n', 'r'], scope: 'view' },
  { id: 'mindmap.newEvent', description: '思维导图：新建事件', keys: ['n', 'e'], scope: 'view' },
  { id: 'mindmap.newTextbox', description: '思维导图：新建文本框', keys: ['n', 't'], scope: 'view' },
  { id: 'mindmap.editName', description: '思维导图：编辑名称', keys: ['e', 'n'], scope: 'view' },
  { id: 'mindmap.editDesc', description: '思维导图：编辑描述', keys: ['e', 'd'], scope: 'view' },
  { id: 'mindmap.connect', description: '思维导图：连接节点', keys: ['c', 'l'], scope: 'view' },
  { id: 'mindmap.deleteNode', description: '思维导图：删除节点', keys: ['d', 'n'], scope: 'view' },
  { id: 'mindmap.createSection', description: '思维导图：创建分组框', keys: ['g', 's'], scope: 'view' },
  { id: 'mindmap.focusNode', description: '思维导图：聚焦节点', keys: ['f', 'n'], scope: 'view' },
  { id: 'mindmap.jumpInto', description: '思维导图：进入子图', keys: ['j', 'i'], scope: 'view' },
  { id: 'mindmap.toggleDetail', description: '思维导图：切换详情侧栏', keys: ['i'], scope: 'view' },
  { id: 'mindmap.fitView', description: '思维导图：适应视图', keys: ['f'], scope: 'view' },
  { id: 'mindmap.exitNested', description: '思维导图：返回上层', keys: ['escape'], scope: 'view' },
]

const recording = ref<string | null>(null)

const sceneProbItems = [
  { id: 'entity_create', label: '实体创建', defaultVal: 80 },
  { id: 'entity_delete', label: '实体删除', defaultVal: 90 },
  { id: 'field_short', label: '短文本编辑', defaultVal: 50 },
  { id: 'field_long', label: '长文本编辑', defaultVal: 40 },
  { id: 'name_input', label: '名称输入', defaultVal: 60 },
  { id: 'relation_create', label: '关系创建', defaultVal: 30 },
  { id: 'relation_delete', label: '关系删除', defaultVal: 40 },
  { id: 'view_switch', label: '视图切换', defaultVal: 20 },
  { id: 'batch_edit', label: '批量编辑', defaultVal: 25 },
]

function onSceneProbChange(sceneId: string, event: Event) {
  const val = Number((event.target as HTMLInputElement).value)
  store.videoModeSceneProbs = { ...store.videoModeSceneProbs, [sceneId]: val }
  dirty.value = true
}

const SCOPE_ORDER = ['global', 'view', 'editor', 'modal']

const allShortcuts = computed(() => DEFAULT_SHORTCUTS)

const shortcutGroups = computed(() => {
  return SCOPE_ORDER
    .map(scope => ({
      scope,
      items: allShortcuts.value.filter(s => s.scope === scope),
    }))
    .filter(g => g.items.length > 0)
})

function scopeLabel(scope: string): string {
  const m: Record<string, string> = { global: '全局', view: '当前视图', editor: '编辑器', modal: '弹窗' }
  return m[scope] || scope
}

function fmt(k: string): string {
  return formatKeyForDisplay(k)
}

function getDisplayKeys(s: ShortcutItem): string[] {
  return store.getShortcut(s.id)
}

function hasOverride(id: string): boolean {
  return id in store.shortcutOverrides
}

function startRecord(id: string) {
  recording.value = id
}

function cancelRecord() {
  recording.value = null
}

function resetKey(id: string) {
  store.resetShortcut(id)
  const defaults = store.SHORTCUT_DEFAULTS as Record<string, string[]>
  if (defaults[id]) {
    updateKeys(id, defaults[id])
  }
  dirty.value = true
}

function onRecordKeydown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()

  const keys: string[] = []
  if (e.ctrlKey || e.metaKey) keys.push('ctrl')
  if (e.altKey) keys.push('alt')
  if (e.shiftKey) keys.push('shift')

  const main = e.key.toLowerCase()
  if (!['control', 'meta', 'alt', 'shift'].includes(main)) {
    const special: Record<string, string> = {
      'escape': 'escape', 'enter': 'enter', ' ': 'space',
      'delete': 'delete', 'backspace': 'backspace', 'tab': 'tab',
    }
    keys.push(special[main] || main)
  }

  if (keys.length > 0) {
    store.setShortcut(recording.value, keys)
    updateKeys(recording.value, keys)
    dirty.value = true
    recording.value = null
  }
}

onMounted(() => {
  document.addEventListener('keydown', onRecordKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onRecordKeydown)
})
</script>

<style scoped>
.set-overlay { position: fixed; inset: 0; z-index: var(--z-overlay); background: rgba(0,0,0,0.35); display: flex; align-items: flex-start; justify-content: center; padding-top: 3vh; }
.set-shell { max-height: 78vh; display: flex; flex-direction: column; position: relative; min-width: 420px; max-width: 680px; width: auto; }

.set-topbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--content-bg, var(--color-bg-surface)); border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.set-topbar-left { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); flex-shrink: 0; }
.set-topbar-title { font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); color: var(--text-color); }
.set-topbar-spacer { flex: 1; }
.set-search-wrap { position: relative; width: 400px; flex-shrink: 0; }
.set-search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary, var(--color-text-tertiary)); pointer-events: none; }
.set-search-input { width: 100%; padding: 5px 28px 5px 28px; font-size: var(--font-size-sm); border: 1px solid var(--border, var(--color-border)); border-radius: 6px; background: var(--bg, var(--color-bg-surface)); color: var(--text-color); }
.set-search-input:focus { outline: none; border-color: var(--primary, var(--color-primary)); }
.set-search-input::placeholder { color: var(--text-tertiary, var(--color-text-tertiary)); }
.set-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: var(--font-size-xs); color: var(--text-tertiary, var(--color-text-tertiary)); cursor: pointer; padding: 2px; }
.set-search-clear:hover { color: var(--text-color); }
.set-close { background: none; border: none; font-size: var(--font-size-lg); cursor: pointer; padding: 4px 6px; border-radius: 4px; color: var(--text-tertiary, var(--color-text-tertiary)); flex-shrink: 0; }
.set-close:hover { background: var(--hover-bg, var(--color-bg-hover)); color: var(--text-color); }

.set-tabs { display: flex; gap: 6px; padding: 8px 0 0; flex-wrap: wrap; }
.set-tab { display: flex; align-items: center; gap: 5px; padding: 7px 14px; border: none; border-radius: 8px; background: var(--content-bg, var(--color-bg-surface)); color: var(--text-secondary); font-size: var(--font-size-sm); cursor: pointer; transition: all 0.15s; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px var(--border, var(--color-border)); }
.set-tab:hover { background: var(--content-bg, var(--color-bg-surface)); color: var(--text-color); box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px var(--border, var(--color-border)); }
.set-tab.active { background: var(--primary-light, color-mix(in srgb, var(--color-primary) 10%, transparent)); color: var(--primary, var(--color-primary)); font-weight: var(--font-weight-medium); box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 12%, transparent), 0 0 0 1px var(--primary, color-mix(in srgb, var(--color-primary) 20%, transparent)); }
.stb-icon { display: inline-flex; }
.stb-label { }

.set-cards { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }

.set-card { background: var(--content-bg, var(--color-bg-surface)); border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.06), 0 0 0 1px var(--border, var(--color-border)); }
.sc-head { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: var(--text-tertiary, var(--color-text-tertiary)); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }

.set-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: var(--font-size-sm); gap: 12px; }
.set-row-sub { padding-left: 16px; }
.set-hint { font-size: var(--font-size-xs); color: var(--text-tertiary, var(--color-text-tertiary)); margin: -2px 0 4px; }

.set-theme-row { display: flex; gap: 6px; }
.set-theme-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border: 1px solid var(--border, var(--color-border)); border-radius: 8px; background: var(--bg, var(--color-bg-surface)); cursor: pointer; transition: all 0.12s; }
.set-theme-btn:hover { border-color: var(--primary, var(--color-primary)); }
.set-theme-btn.on { border-color: var(--primary, var(--color-primary)); background: var(--primary-light, color-mix(in srgb, var(--color-primary) 10%, transparent)); }
.st-icon { font-size: var(--font-size-xl); }
.st-label { font-size: var(--font-size-xs); color: var(--text-secondary); }

.set-theme-editor-btn {
  margin-top: 8px; width: 100%; padding: 8px 12px; border: 1px dashed var(--border, var(--color-border));
  border-radius: 8px; background: transparent; cursor: pointer; font-size: var(--font-size-sm);
  color: var(--text-secondary); transition: all 0.15s; text-align: center;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.set-theme-editor-btn:hover { border-color: var(--primary, var(--color-primary)); color: var(--primary, var(--color-primary)); background: var(--primary-light, color-mix(in srgb, var(--color-primary) 10%, transparent)); }

.set-toggle { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; flex-shrink: 0; }
.set-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.set-toggle-slider { position: absolute; inset: 0; background: var(--border, var(--color-border)); border-radius: 20px; transition: background 0.2s; }
.set-toggle-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; background: var(--color-bg-surface); border-radius: 50%; transition: transform 0.2s; }
.set-toggle input:checked + .set-toggle-slider { background: var(--primary, var(--color-primary)); }
.set-toggle input:checked + .set-toggle-slider::before { transform: translateX(16px); }

.set-input { padding: 4px 8px; font-size: var(--font-size-sm); border: 1px solid var(--border, var(--color-border)); border-radius: 6px; background: var(--bg, var(--color-bg-surface)); color: var(--text-color); }
.set-input:focus { outline: none; border-color: var(--primary, var(--color-primary)); }
.set-input-sm { width: 72px; text-align: center; }
.set-select { padding: 4px 8px; font-size: var(--font-size-sm); border: 1px solid var(--border, var(--color-border)); border-radius: 6px; background: var(--bg, var(--color-bg-surface)); color: var(--text-color); cursor: pointer; }
.set-select:focus { outline: none; border-color: var(--primary, var(--color-primary)); }
.set-range-wrap { display: flex; align-items: center; gap: 8px; }
.set-range { width: 100px; accent-color: var(--primary, var(--color-primary)); }
.set-range-val { font-size: var(--font-size-sm); color: var(--text-secondary); min-width: 28px; text-align: right; font-family: monospace; }

.set-plugin-search { margin-bottom: 8px; }
.set-plugin-search .set-input { width: 100%; }
.set-plugin-list { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px; max-height: 320px; overflow-y: auto; }
.set-plugin-item { padding: 3px 0; display: flex; align-items: center; gap: 4px; }
.sp-grip { cursor: grab; color: var(--text-tertiary, #bbb); font-size: var(--font-size-base); line-height: 1; padding: 2px 2px; user-select: none; flex-shrink: 0; transition: color 0.1s; }
.sp-grip:hover { color: var(--text-secondary, #888); }
.sp-grip:active { cursor: grabbing; }
.sp-ghost { opacity: 0.4; background: var(--primary-light, color-mix(in srgb, var(--color-primary) 10%, transparent)); border-radius: 4px; }
.sp-drag { background: var(--content-bg, var(--color-bg-surface)); box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 4px; }
.sp-source { font-size: var(--text-micro-font-size); color: var(--text-tertiary, var(--color-text-tertiary)); background: var(--bg-secondary, var(--color-bg-elevated)); padding: 1px 4px; border-radius: 3px; margin-right: 4px; }
.sp-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: var(--font-size-sm); padding: 4px 6px; border-radius: 6px; transition: background 0.1s; }
.sp-toggle:hover { background: var(--hover-bg, var(--color-bg-hover)); }
.sp-toggle input { margin: 0; accent-color: var(--primary, var(--color-primary)); }
.sp-icon { font-size: var(--font-size-lg); }
.sp-label { font-size: var(--font-size-sm); }

.set-panel-widths { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light, var(--color-border)); }
.spw-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: var(--font-size-sm); }
.spw-label { flex: 1; color: var(--text-color); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spw-value { font-size: var(--font-size-xs); color: var(--text-tertiary, var(--color-text-tertiary)); font-family: monospace; flex-shrink: 0; }
.spw-reset { width: 20px; height: 20px; border: none; background: transparent; color: var(--text-tertiary, var(--color-text-tertiary)); cursor: pointer; font-size: var(--font-size-xs); border-radius: 3px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
.spw-reset:hover { background: var(--hover-bg, var(--color-bg-hover)); color: var(--primary); }

.set-btn-row { display: flex; gap: 8px; margin-top: 6px; }
.set-btn { font-size: var(--font-size-sm); padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border, var(--color-border)); background: var(--bg, var(--color-bg-surface)); cursor: pointer; color: var(--text-color); transition: all 0.15s; }
.set-btn:hover { border-color: var(--primary, var(--color-primary)); background: var(--primary-light, color-mix(in srgb, var(--color-primary) 10%, transparent)); }
.set-btn-danger { color: var(--danger, var(--color-danger)); border-color: var(--danger, var(--color-danger)); }
.set-btn-danger:hover { background: var(--danger, var(--color-danger)); color: #fff; }

.set-empty { text-align: center; padding: 32px 0; color: var(--text-tertiary, var(--color-text-tertiary)); font-size: var(--font-size-sm); }

.ss-group { margin-bottom: 10px; }
.ss-scope { font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); color: var(--text-tertiary, var(--color-text-tertiary)); margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.ss-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; border-radius: 4px; font-size: var(--font-size-sm); }
.ss-row:hover { background: var(--hover-bg, var(--color-bg-hover)); }
.ss-desc { color: var(--text-color); font-size: var(--font-size-sm); }
.ss-keys-area { display: flex; align-items: center; gap: 4px; }
.ss-keys { display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 2px 6px; border: 1px solid transparent; border-radius: 4px; transition: border-color 0.1s; }
.ss-keys:hover { border-color: var(--primary, var(--color-primary)); }
.ss-keys:hover .ss-edit-icon { opacity: 1; }
.ss-edit-icon { font-size: var(--font-size-xs); opacity: 0.3; margin-left: 2px; }
.ss-kbd { display: inline-flex; align-items: center; padding: 1px 5px; font-size: var(--font-size-xs); font-family: inherit; background: var(--bg-secondary, var(--color-bg-elevated)); border: 1px solid var(--border, var(--color-border)); border-radius: 3px; box-shadow: 0 1px 0 var(--border, var(--color-border)); color: var(--text-color); }
.ss-recording { font-size: var(--font-size-sm); color: var(--primary, var(--color-primary)); font-weight: var(--font-weight-medium); padding: 2px 8px; animation: ws-pulse 0.8s infinite; cursor: pointer; }
.ss-reset { font-size: var(--font-size-base); background: none; border: none; cursor: pointer; color: var(--text-tertiary, var(--color-text-tertiary)); padding: 2px; border-radius: 3px; }
.ss-reset:hover { color: var(--danger, var(--color-danger)); background: var(--hover-bg); }

.resize-handle-right { position: absolute; right: 0; top: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent; transition: background 0.15s; }
.resize-handle-right:hover, .resize-handle-right:active { background: var(--primary); opacity: 0.3; }
</style>
